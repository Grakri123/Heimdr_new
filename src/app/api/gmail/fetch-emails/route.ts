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

export async function GET(req: Request) {
  try {
    const supabase = createApiClient()

    // 👉 Try to get from header (Edge Function call)
    const userIdHeader = req.headers.get('x-user-id')
    const tokenHeader = req.headers.get('x-provider-token')

    let userId = userIdHeader || null
    let accessToken = tokenHeader || null

    if (!userId || !accessToken) {
      // 👉 Fallback to session (frontend call)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session?.user) {
        console.log('📬 Gmail: No user found (neither from session nor header)')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      userId = session.user.id

      // Get token from Supabase
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
      
      // Set up OAuth2 client with tokens
      oauth2Client.setCredentials({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
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
        const email = await gmail.users.messages.get({
          userId: 'me',
          id: message.id!,
          format: 'full',
        })

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
          analyzed_at: null,  // Explicitly set to null to force reanalysis
          ai_risk_level: null,  // Reset analysis results
          ai_reason: null  // Reset analysis results
        }

        // Store in database using upsert
        const { error: upsertError } = await supabase
          .from('emails')
          .upsert(emailData, {
            onConflict: 'id',
            ignoreDuplicates: false
          })

        if (upsertError) {
          console.error('📬 Gmail: Feil ved lagring av e-post:', message.id, upsertError)
          continue
        }

        console.log('📬 Gmail: Lagret/oppdaterte e-post:', message.id, '(analyzed_at nullstilt)')
        newEmails.push(emailData)

        // Analyze the new email
        try {
          console.log(`📊 Forbereder analyse av e-post ${message.id}:`, {
            hasFrom: !!from,
            hasSubject: !!subject,
            bodyLength: body?.length || 0
          })
          
          const emailContent = `From: ${from}\nSubject: ${subject}\n\n${body}`
          console.log(`🤖 Starter analyse av e-post ${message.id}...`)
          await analyzeNewEmail(supabase, message.id, emailContent)
          console.log(`✅ Analyse fullført for e-post ${message.id}`)
        } catch (analysisError) {
          console.error(`❌ Feil ved analyse av e-post ${message.id}:`, analysisError)
          if (analysisError instanceof Error) {
            console.error('Detaljert feil:', {
              name: analysisError.name,
              message: analysisError.message,
              stack: analysisError.stack
            })
          }
          analysisErrors.push({
            id: message.id,
            error: analysisError instanceof Error ? analysisError.message : 'Ukjent feil ved analyse'
          })
        }
      } catch (error) {
        console.error('📬 Gmail: Feil ved prosessering av e-post:', message.id, error)
      }
    }

    console.log(`📬 Gmail: Fant ${response.data.messages.length} e-poster. ${newEmails.length} nye ble lagret. ${skippedCount} eksisterte fra før.`)
    if (analysisErrors.length > 0) {
      console.log(`📬 Gmail: ${analysisErrors.length} e-poster kunne ikke analyseres:`, analysisErrors)
    }

    return NextResponse.json({
      newEmails: newEmails.length,
      emails: newEmails,
      analysisErrors: analysisErrors.length > 0 ? analysisErrors : undefined
    })
  } catch (error) {
    console.error('📬 Gmail: Uventet feil:', error)
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