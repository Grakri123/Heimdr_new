import { createApiClient } from '@/lib/supabase/server'
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
  `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/integrations`
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

export async function GET(req: Request) {
  try {
    const supabase = createApiClient()

    // 👉 Try to get from header (Edge Function call)
    const userIdHeader = req.headers.get('x-user-id')
    const tokenHeader = req.headers.get('x-provider-token')

    let userId = userIdHeader || null
    let accessToken = tokenHeader || null
    let refreshToken: string | undefined

    if (!userId || !accessToken) {
      // 👉 Fallback to session (frontend call)
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

    // Fetch last 10 emails with automatic token refresh if needed
    const response = await executeGmailApiCall(
      () => gmail.users.messages.list({
        userId: 'me',
        maxResults: 10,
      }),
      supabase,
      userId
    )

    console.log('📬 Gmail: Status =', response.status)
    console.log('📬 Gmail: API-respons =', JSON.stringify(response.data, null, 2))

    if (!response.data.messages) {
      console.log('📬 Gmail: Ingen e-poster funnet')
      return NextResponse.json({ emails: [] })
    }

    // Get existing email IDs to avoid duplicates
    const { data: existingEmails, error: existingError } = await supabase
      .from('emails')
      .select('message_id, analyzed_at')
      .eq('user_id', userId)
      .eq('source', 'gmail')

    if (existingError) {
      console.error('📬 Gmail: Feil ved henting av eksisterende e-poster:', existingError)
      throw existingError
    }

    // Create a map of existing IDs with their analyzed status
    const existingEmailMap = new Map(
      existingEmails?.map(e => [e.message_id, e.analyzed_at !== null]) || []
    )
    const newEmails = []
    let skippedCount = 0
    const analysisErrors = []

    // Process each email
    for (const message of response.data.messages) {
      // Skip only if email exists AND has been analyzed
      if (existingEmailMap.has(message.id) && existingEmailMap.get(message.id)) {
        skippedCount++
        continue
      }

      try {
        const email = await executeGmailApiCall(
          () => gmail.users.messages.get({
            userId: 'me',
            id: message.id!,
            format: 'full',
          }),
          supabase,
          userId
        )

        const headers = email.data.payload?.headers
        const from = headers?.find((h) => h.name === 'From')?.value || ''
        const subject = headers?.find((h) => h.name === 'Subject')?.value || ''
        const date = headers?.find((h) => h.name === 'Date')?.value || ''

        // Get email body
        const body = await getEmailBody(email.data.payload)

        const emailData = {
          id: message.id,
          user_id: userId,
          from_address: from,
          subject,
          date: new Date(date).toISOString(),
          body,
          source: 'gmail',
          message_id: message.id,
          created_at: new Date().toISOString(),
          analyzed_at: null,
          ai_risk_level: null,
          ai_reason: null
        }

        // Store in database using upsert
        const { error: upsertError } = await supabase
          .from('emails')
          .upsert(emailData, {
            onConflict: 'id',
            ignoreDuplicates: false
          })

        if (upsertError) {
          console.error('📬 Gmail: Error saving email:', message.id, upsertError)
          continue
        }

        console.log('📬 Gmail: Saved/updated email:', message.id, '(analyzed_at reset)')
        newEmails.push(emailData)

        // Analyze the new email
        try {
          console.log(`📊 Preparing analysis of email ${message.id}:`, {
            hasFrom: !!from,
            hasSubject: !!subject,
            bodyLength: body?.length || 0
          })
          
          const emailContent = `From: ${from}\nSubject: ${subject}\n\n${body}`
          console.log(`🤖 Starting analysis of email ${message.id}...`)
          await analyzeNewEmail(supabase, message.id, emailContent)
          console.log(`✅ Analysis completed for email ${message.id}`)
        } catch (analysisError) {
          console.error(`❌ Error analyzing email ${message.id}:`, analysisError)
          if (analysisError instanceof Error) {
            console.error('Detailed error:', {
              name: analysisError.name,
              message: analysisError.message,
              stack: analysisError.stack
            })
          }
          analysisErrors.push({
            id: message.id,
            error: analysisError instanceof Error ? analysisError.message : 'Unknown analysis error'
          })
        }
      } catch (error) {
        console.error('📬 Gmail: Error processing email:', message.id, error)
        if (error instanceof Error && error.message === 'Failed to refresh access token') {
          console.log('📬 Gmail: Stopping email processing due to token refresh failure')
          break
        }
      }
    }

    console.log(`📬 Gmail: Found ${response.data.messages.length} emails. ${newEmails.length} new saved. ${skippedCount} already existed.`)
    if (analysisErrors.length > 0) {
      console.log(`📬 Gmail: ${analysisErrors.length} emails could not be analyzed:`, analysisErrors)
    }

    return NextResponse.json({
      newEmails: newEmails.length,
      emails: newEmails,
      analysisErrors: analysisErrors.length > 0 ? analysisErrors : undefined
    })
  } catch (error) {
    console.error('📬 Gmail: Unexpected error:', error)
    
    // Check if error is related to authentication
    if (error instanceof Error && 
        (error.message.includes('invalid_token') || 
         error.message.includes('Invalid Credentials') ||
         error.message === 'Failed to refresh access token')) {
      return NextResponse.json(
        { error: 'Gmail authentication failed - please reconnect your account' },
        { status: 401 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch emails' },
      { status: 500 }
    )
  }
}

// Helper function to extract email body from Gmail payload
async function getEmailBody(payload: any): Promise<string> {
  try {
    // Log payload structure for debugging
    console.log('📧 Payload struktur:', {
      mimeType: payload.mimeType,
      hasBody: !!payload.body,
      bodySize: payload.body?.size,
      hasParts: !!payload.parts,
      partsCount: payload.parts?.length,
      partTypes: payload.parts?.map((p: any) => p.mimeType)
    })

    // Improved text content extraction with validation
    const decodeBase64 = (data: string, context: string): string | null => {
      try {
        const decoded = Buffer.from(data, 'base64').toString('utf-8')
        // Validate that we got readable text
        if (decoded && decoded.length > 0 && /^[\x00-\x7F\u0080-\uFFFF]*$/.test(decoded)) {
          return decoded
        }
        console.warn(`❌ Dekodet innhold ugyldig (${context}): Inneholder ugyldige tegn eller er tom`)
        return null
      } catch (e) {
        console.error(`❌ Base64 dekodefeil (${context}):`, e)
        return null
      }
    }

    // Recursive function to find content in deeply nested parts
    const findTextContent = (part: any, depth: number = 0): string | null => {
      if (depth > 10) {
        console.warn('⚠️ Maksimal søkedybde nådd i e-poststruktur')
        return null
      }

      // Log part structure
      console.log(`📧 Undersøker part (dybde ${depth}):`, {
        mimeType: part.mimeType,
        hasBody: !!part.body,
        hasParts: !!part.parts
      })

      // Check for direct body content
      if (part.body?.data) {
        const content = decodeBase64(part.body.data, `part-${part.mimeType || 'unknown'}`)
        if (content) return content
      }

      // Recursively check all nested parts
      if (part.parts) {
        for (const subPart of part.parts) {
          const content = findTextContent(subPart, depth + 1)
          if (content) return content
        }
      }

      return null
    }

    // Enhanced MIME type content finder
    const findContentByMimeType = (mimeType: string): string | null => {
      console.log(`📧 Leter etter innhold av type: ${mimeType}`)
      
      // First check main payload if it matches
      if (payload.mimeType === mimeType && payload.body?.data) {
        const content = decodeBase64(payload.body.data, `main-${mimeType}`)
        if (content) return content
      }

      // Then check all parts recursively
      const searchParts = (parts: any[], depth: number = 0): string | null => {
        if (depth > 10) return null

        for (const part of parts) {
          // Check if this part matches
          if (part.mimeType === mimeType) {
            const content = findTextContent(part, depth)
            if (content) return content
          }

          // Check nested parts
          if (part.parts) {
            const nestedContent = searchParts(part.parts, depth + 1)
            if (nestedContent) return nestedContent
          }
        }
        return null
      }

      if (payload.parts) {
        return searchParts(payload.parts)
      }
      return null
    }

    // Try to get plain text first
    let content = findContentByMimeType('text/plain')
    if (content) {
      console.log('📧 Fant text/plain innhold')
    }

    // If no plain text, try HTML
    if (!content) {
      console.log('📧 Prøver å hente HTML-innhold...')
      content = findContentByMimeType('text/html')
      if (content) {
        console.log('📧 Konverterer HTML til ren tekst')
        content = content
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&[a-z]+;/g, '')
          .replace(/\s+/g, ' ')
          .trim()
      }
    }

    // Last resort: try payload body directly
    if (!content && payload.body?.data) {
      console.log('📧 Prøver direkte payload.body.data')
      content = decodeBase64(payload.body.data, 'direct-payload')
    }

    // Validate final content
    if (!content) {
      console.warn('⚠️ Ingen innhold funnet i e-posten')
      return 'Ingen e-postinnhold funnet'
    }

    // Ensure we have valid text content
    if (content.trim().length === 0) {
      console.warn('⚠️ Fant tomt innhold i e-posten')
      return 'Tomt e-postinnhold'
    }

    console.log(`📧 Vellykket innhenting av e-postinnhold (${content.length} tegn)`)
    return content

  } catch (error) {
    console.error('❌ Kritisk feil i getEmailBody():', error)
    if (error instanceof Error) {
      console.error('Detaljer:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      })
    }
    return 'Feil ved henting av e-postinnhold'
  }
} 