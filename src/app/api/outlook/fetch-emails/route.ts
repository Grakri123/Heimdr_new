import { createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { analyzeNewEmail } from '@/lib/email/analyze'

// Helper function to convert HTML to plain text
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Helper function to refresh token and update in Supabase
async function refreshOutlookToken(supabase: any, userId: string, refreshToken: string) {
  try {
    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.OUTLOOK_CLIENT_ID!,
        client_secret: process.env.OUTLOOK_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        redirect_uri: process.env.OUTLOOK_REDIRECT_URI!,
      }),
    })

    const tokenData = await tokenRes.json()
    
    if (!tokenData.access_token) {
      console.error('Token refresh failed:', tokenData)
      return null
    }

    // Update token in database
    const { error: updateError } = await supabase
      .from('outlook_tokens')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || refreshToken, // Use new refresh token if provided
        expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)

    if (updateError) {
      console.error('Failed to update refreshed token in database:', updateError)
      return null
    }

    return tokenData.access_token
  } catch (error) {
    console.error('Token refresh failed:', error)
    return null
  }
}

export async function GET(req: Request) {
  try {
    const supabase = createServerClient()

    // Try to get from header (Edge Function call)
    const userIdHeader = req.headers.get('x-user-id')
    const tokenHeader = req.headers.get('x-provider-token')

    let userId = userIdHeader || null
    let accessToken = tokenHeader || null
    let refreshToken: string | undefined

    if (!userId || !accessToken) {
      // Fallback to session (frontend call)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session?.user) {
        console.log('📬 Outlook: No user found (neither from session nor header)')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      userId = session.user.id

      // Get tokens from Supabase
      const { data: tokenData, error: tokenError } = await supabase
        .from('outlook_tokens')
        .select('access_token, refresh_token, expires_at')
        .eq('user_id', userId)
        .single()

      if (tokenError || !tokenData) {
        console.log('📬 Outlook: No token found')
        return NextResponse.json(
          { error: 'Outlook token not found' },
          { status: 404 }
        )
      }

      // Check if token is expired
      const expiresAt = new Date(tokenData.expires_at)
      if (expiresAt <= new Date()) {
        console.log('📬 Outlook: Token expired, refreshing...')
        const newAccessToken = await refreshOutlookToken(supabase, userId, tokenData.refresh_token)
        if (!newAccessToken) {
          return NextResponse.json(
            { error: 'Failed to refresh Outlook token' },
            { status: 401 }
          )
        }
        accessToken = newAccessToken
      } else {
        accessToken = tokenData.access_token
        refreshToken = tokenData.refresh_token
      }
    }

    // Fetch emails from Outlook
    const response = await fetch('https://graph.microsoft.com/v1.0/me/messages?$top=10&$orderby=receivedDateTime desc', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Outlook API error:', errorData)

      // Check for auth errors
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'Outlook authentication failed - please reconnect your account' },
          { status: 401 }
        )
      }

      return NextResponse.json(
        { error: 'Failed to fetch Outlook messages' },
        { status: response.status }
      )
    }

    const data = await response.json()
    const messages = data.value || []
    const processedEmails = []

    for (const message of messages) {
      // Store in Supabase
      const { data: existingEmail } = await supabase
        .from('emails')
        .select('id')
        .eq('message_id', message.id)
        .single()

      if (!existingEmail) {
        const { data: newEmail, error: insertError } = await supabase
          .from('emails')
          .insert({
            user_id: userId,
            message_id: message.id,
            subject: message.subject,
            from: message.from.emailAddress.address,
            body: message.body.content ? htmlToPlainText(message.body.content) : '',
            date: message.receivedDateTime,
            provider: 'outlook'
          })
          .select()
          .single()

        if (insertError) {
          console.error('Error storing email:', insertError)
          continue
        }

        if (newEmail) {
          processedEmails.push(newEmail)
        }
      }
    }

    return NextResponse.json({ 
      message: `Processed ${processedEmails.length} new emails`,
      emails: processedEmails
    })

  } catch (error: any) {
    console.error('Error fetching Outlook messages:', error)

    // Check for token expiration
    if (error.message?.includes('InvalidAuthenticationToken')) {
      return NextResponse.json(
        { error: 'Outlook authentication failed - please reconnect your account' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    )
  }
}
