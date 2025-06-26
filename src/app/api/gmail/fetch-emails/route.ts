import { createServerClient } from '@/lib/supabase/server'
import { google } from 'googleapis'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/supabase'
import { analyzeNewEmail } from '@/lib/email/analyze'

// Add dynamic route configuration
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const oauth2Client = new google.auth.OAuth2(
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard`
)

// Helper function to refresh token and update in Supabase if needed
async function refreshAccessToken(supabase: any, userId: string, currentRefreshToken?: string) {
  try {
    if (!currentRefreshToken) {
      // Try to get refresh token from database if not provided
      const { data: tokenData, error: tokenError } = await supabase
        .from('gmail_tokens')
        .select('refresh_token')
        .eq('user_id', userId)
        .single()

      if (tokenError || !tokenData?.refresh_token) {
        console.log('📬 Gmail: No refresh token available for refresh attempt')
        return null
      }
      currentRefreshToken = tokenData.refresh_token
    }

    // Set refresh token and attempt refresh
    oauth2Client.setCredentials({
      refresh_token: currentRefreshToken
    })

    const { credentials } = await oauth2Client.refreshAccessToken()
    const newAccessToken = credentials.access_token
    
    if (!newAccessToken) {
      console.log('📬 Gmail: Token refresh failed - no new token received')
      return null
    }

    // Update token in database
    const { error: updateError } = await supabase
      .from('gmail_tokens')
      .update({ 
        access_token: newAccessToken,
        refresh_token: credentials.refresh_token || currentRefreshToken, // Use new refresh token if provided
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)

    if (updateError) {
      console.error('📬 Gmail: Failed to update refreshed token in database:', updateError)
      return null
    }

    console.log('📬 Gmail: Successfully refreshed and updated access token')
    return newAccessToken
  } catch (error) {
    console.error('📬 Gmail: Token refresh failed:', error)
    return null
  }
}

// Helper function to execute Gmail API call with retry on token error
async function executeGmailApiCall<T>(apiCall: () => Promise<T>, supabase: any, userId: string): Promise<T> {
  try {
    return await apiCall()
  } catch (error: any) {
    // Check if error is due to invalid token
    if (error?.message?.includes('invalid_token') || error?.message?.includes('Invalid Credentials')) {
      console.log('📬 Gmail: Token error detected, attempting refresh...')
      const newAccessToken = await refreshAccessToken(supabase, userId)
      
      if (!newAccessToken) {
        throw new Error('Failed to refresh access token')
      }

      // Update client credentials and retry
      oauth2Client.setCredentials({ access_token: newAccessToken })
      return await apiCall()
    }
    throw error
  }
}

// Robust uthenting av body
function extractBody(payload: any): string {
  if (payload?.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString();
  }
  if (payload?.parts) {
    const textPart = payload.parts.find((part: any) => part.mimeType === 'text/plain');
    if (textPart) {
      return extractBody(textPart);
    }
    const htmlPart = payload.parts.find((part: any) => part.mimeType === 'text/html');
    if (htmlPart) {
      return extractBody(htmlPart);
    }
    for (const part of payload.parts) {
      const result = extractBody(part);
      if (result) return result;
    }
  }
  return '';
}

export async function GET(req: Request) {
  try {
    const supabase = createServerClient()

    // Try to get from header (Edge Function call)
    const userIdHeader = req.headers.get('x-user-id')
    const tokenHeader = req.headers.get('x-provider-token')
    const userEmailHeader = req.headers.get('x-user-email')

    let userId = userIdHeader || null
    let accessToken = tokenHeader || null
    let refreshToken: string | undefined

    if (!userId || !accessToken) {
      // Fallback to session (frontend call)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session?.user) {
        console.log('📬 Gmail: No user found (neither from session nor header)')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      userId = session.user.id

      // Get tokens from Supabase
      const { data: tokenData, error: tokenError } = await supabase
        .from('gmail_tokens')
        .select('access_token, refresh_token')
        .eq('user_id', userId)
        .single()

      if (tokenError || !tokenData) {
        console.log('📬 Gmail: No token found')
        return NextResponse.json(
          { error: 'Gmail token not found' },
          { status: 404 }
        )
      }

      accessToken = tokenData.access_token
      refreshToken = tokenData.refresh_token
      
      // Set up OAuth2 client with tokens
      oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
    } else {
      // Using header-provided token
      oauth2Client.setCredentials({
        access_token: accessToken
      })
    }

    console.log('📬 Gmail: User ID =', userId)
    console.log('📬 Gmail: access_token =', accessToken.substring(0, 10) + '... (truncated)')

    // Create Gmail API client
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Get messages from Gmail
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 10,
      q: 'in:inbox -category:promotions -category:social -category:updates -category:forums',
    })

    const messages = response.data.messages || []
    const processedEmails = []

    // Get user email from gmail_tokens hvis ikke header
    let userEmail = userEmailHeader;
    if (!userEmail) {
      const { data: tokenEmailData } = await supabase
        .from('gmail_tokens')
        .select('email')
        .eq('user_id', userId)
        .single()
      userEmail = tokenEmailData?.email || null;
    }

    for (const message of messages) {
      const fullMessage = await gmail.users.messages.get({
        userId: 'me',
        id: message.id!,
        format: 'full',
      })

      const headers = fullMessage.data.payload?.headers || []
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject'
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender'
      const date = new Date(parseInt(fullMessage.data.internalDate!)).toISOString()

      // Extract email body
      let body = extractBody(fullMessage.data.payload);

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
            id: message.id,
            user_id: userId,
            user_email: userEmail,
            message_id: message.id,
            subject,
            from_address: from,
            body,
            date,
            source: 'gmail'
          })
          .select()
          .single()

        if (insertError) {
          console.error('Error storing email:', insertError)
          continue
        }

        if (newEmail) {
          // Analyze the new email
          try {
            const emailContent = `From: ${newEmail.from_address}\nSubject: ${newEmail.subject}\n\n${newEmail.body}`
            await analyzeNewEmail(supabase, newEmail.id, emailContent)
            console.log('📬 Gmail: Successfully analyzed email:', newEmail.id)
          } catch (error) {
            console.error('📬 Gmail: Error analyzing email:', error)
          }
          processedEmails.push(newEmail)
        }
      }
    }

    return NextResponse.json({ 
      message: `Processed ${processedEmails.length} new emails`,
      emails: processedEmails
    })

  } catch (error: any) {
    console.error('Error fetching Gmail messages:', error)

    // Check for token expiration
    if (error.message?.includes('invalid_grant') || error.message?.includes('Invalid Credentials')) {
      return NextResponse.json({ error: 'Gmail authentication failed - please reconnect your account' }, { status: 401 })
    }

    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }
}