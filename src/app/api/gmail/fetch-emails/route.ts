import { createServerClient } from '@/lib/supabase/server'
import { google } from 'googleapis'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/supabase'

const oauth2Client = new google.auth.OAuth2(
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/integrations`
)

export async function GET() {
  try {
    // Get the user session from Supabase
    const supabase = createServerClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch Gmail token from Supabase
    const { data: tokenData, error: tokenError } = await supabase
      .from('gmail_tokens')
      .select('access_token, refresh_token')
      .eq('user_id', session.user.id)
      .single()

    if (tokenError || !tokenData) {
      return NextResponse.json(
        { error: 'Gmail token not found' },
        { status: 404 }
      )
    }

    // Set up OAuth2 client with tokens
    oauth2Client.setCredentials({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
    })

    // Create Gmail API client
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Fetch last 10 emails
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 10,
    })

    if (!response.data.messages) {
      return NextResponse.json({ emails: [] })
    }

    // Fetch details for each email
    const emails = await Promise.all(
      response.data.messages.map(async (message) => {
        const email = await gmail.users.messages.get({
          userId: 'me',
          id: message.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        })

        const headers = email.data.payload?.headers
        const from = headers?.find((h) => h.name === 'From')?.value || ''
        const subject = headers?.find((h) => h.name === 'Subject')?.value || ''
        const date = headers?.find((h) => h.name === 'Date')?.value || ''

        return {
          id: message.id,
          from,
          subject,
          date: new Date(date).toLocaleDateString('nb-NO', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        }
      })
    )

    return NextResponse.json({ emails })
  } catch (error) {
    console.error('Error fetching emails:', error)
    return NextResponse.json(
      { error: 'Failed to fetch emails' },
      { status: 500 }
    )
  }
} 