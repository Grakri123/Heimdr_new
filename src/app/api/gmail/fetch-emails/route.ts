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
      console.log('📬 Gmail: Ingen bruker funnet')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('📬 Gmail: Bruker ID =', session.user.id)

    // Fetch Gmail token from Supabase
    const { data: tokenData, error: tokenError } = await supabase
      .from('gmail_tokens')
      .select('access_token, refresh_token')
      .eq('user_id', session.user.id)
      .single()

    if (tokenError || !tokenData) {
      console.log('📬 Gmail: Ingen token funnet')
      return NextResponse.json(
        { error: 'Gmail token not found' },
        { status: 404 }
      )
    }

    console.log('📬 Gmail: access_token =', tokenData.access_token.substring(0, 10) + '... (trunkert)')

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

    console.log('📬 Gmail: Status =', response.status)
    console.log('📬 Gmail: API-respons =', JSON.stringify(response.data, null, 2))

    if (!response.data.messages) {
      console.log('📬 Gmail: Ingen e-poster funnet')
      return NextResponse.json({ emails: [] })
    }

    // Get existing email IDs to avoid duplicates
    const { data: existingEmails, error: existingError } = await supabase
      .from('emails')
      .select('message_id')
      .eq('user_id', session.user.id)
      .eq('source', 'gmail')

    if (existingError) {
      console.error('📬 Gmail: Feil ved henting av eksisterende e-poster:', existingError)
      throw existingError
    }

    const existingIds = new Set(existingEmails?.map(e => e.message_id) || [])
    const newEmails = []
    let skippedCount = 0

    // Process each email
    for (const message of response.data.messages) {
      if (existingIds.has(message.id)) {
        skippedCount++
        continue
      }

      try {
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

        const emailData = {
          id: message.id,
          user_id: session.user.id,
          from_address: from,
          subject,
          date: new Date(date).toISOString(),
          body: '',
          source: 'gmail',
          message_id: message.id,
          created_at: new Date().toISOString()
        }

        // Store in database
        const { error: insertError } = await supabase
          .from('emails')
          .insert(emailData)

        if (insertError) {
          console.error('📬 Gmail: Feil ved lagring av e-post:', message.id, insertError)
          continue
        }

        console.log('📬 Gmail: Lagret ny e-post:', message.id)
        newEmails.push(emailData)
      } catch (error) {
        console.error('📬 Gmail: Feil ved prosessering av e-post:', message.id, error)
      }
    }

    console.log(`📬 Gmail: Fant ${response.data.messages.length} e-poster. ${newEmails.length} nye ble lagret. ${skippedCount} eksisterte fra før.`)

    return NextResponse.json({
      newEmails: newEmails.length,
      emails: newEmails
    })
  } catch (error) {
    console.error('📬 Gmail: Uventet feil:', error)
    return NextResponse.json(
      { error: 'Failed to fetch emails' },
      { status: 500 }
    )
  }
} 