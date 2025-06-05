import { createApiClient } from '@/lib/supabase/server'
import { google } from 'googleapis'
import OpenAI from 'openai'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // This function can run for 5 minutes

// Log available environment variables (without showing the actual values)
console.log('Available environment variables:', Object.keys(process.env))

const oauth2Client = new google.auth.OAuth2(
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/integrations`
)

type RiskLevel = 'Lav' | 'Medium' | 'Høy'

interface AnalysisResponse {
  riskLevel: RiskLevel
  reason: string
}

async function testOpenAIConnection(apiKey: string): Promise<boolean> {
  try {
    const openai = new OpenAI({ apiKey })
    // Try a simple completion to test the connection
    await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Test connection' }],
      max_tokens: 5
    })
    return true
  } catch (error) {
    console.error('OpenAI connection test failed:', error)
    return false
  }
}

async function analyzeEmailWithGPT(emailContent: string): Promise<AnalysisResponse> {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.error('OpenAI API key is not set')
      throw new Error('OpenAI API key is not configured')
    }
    console.log('OpenAI API key is set (length):', apiKey.length)

    const openai = new OpenAI({
      apiKey: apiKey,
    })

    const prompt = [
      'Du er en norsk cybersikkerhetsekspert som analyserer e-poster for mulig svindel, phishing eller skadevare.',
      '',
      'Vurder e-posten basert på:',
      '- Avsender (mistenkelige domener, falske navn)',
      '- Innhold (trusler, press, uvanlige forespørsler)',
      '- Lenker (mistenkelige URL-er, misvisende tekst)',
      '- Generell teknisk struktur (mangler, rar oppbygning)',
      '',
      'Svar strengt: Hvis noe er uklart eller mistenkelig, vurder det som minst "Medium".',
      '',
      'Svar i følgende JSON-format (maks 1-2 setninger som begrunnelse):',
      '',
      '{',
      '  "riskLevel": "Lav" | "Medium" | "Høy",',
      '  "reason": "Kort begrunnelse på norsk"',
      '}',
      '',
      'E-post:',
      emailContent,
      '',
      'Du må svare i følgende JSON-format, og riskLevel MÅ være en av følgende verdier: "Lav", "Medium", eller "Høy":',
      '{',
      '  "riskLevel": "Lav|Medium|Høy",',
      '  "reason": "Kort begrunnelse for vurderingen"',
      '}',
      '',
      'Svar KUN med JSON, ingen annen tekst.'
    ].join('\n')

    console.log('Starting OpenAI analysis...')
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Du er en ekspert på å analysere e-poster for svindel og skadelig innhold. Vurder risikoen og gi en kort begrunnelse på norsk. Du må være konsistent med risikonivåene og kun bruke: Lav, Medium, eller Høy. Svar kun med JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })
      console.log('OpenAI analysis completed successfully')

      const responseContent = completion.choices[0].message.content
      console.log('OpenAI raw response:', responseContent)

      try {
        const response = JSON.parse(responseContent.trim()) as AnalysisResponse
        console.log('Parsed response:', response)

        // Validate and normalize the risk level
        const normalizedRiskLevel = normalizeRiskLevel(response.riskLevel)
        console.log('Normalized risk level:', normalizedRiskLevel)
        
        return {
          riskLevel: normalizedRiskLevel,
          reason: response.reason || 'Ingen begrunnelse tilgjengelig'
        }
      } catch (parseError) {
        console.error('Error parsing OpenAI response:', parseError)
        throw new Error('Could not parse OpenAI response as JSON')
      }
    } catch (apiError) {
      console.error('OpenAI API Error:', apiError)
      if (apiError instanceof Error) {
        console.error('API Error details:', {
          message: apiError.message,
          name: apiError.name,
          stack: apiError.stack,
          response: (apiError as any).response?.data
        })
      }
      throw apiError
    }
  } catch (error) {
    console.error('Error in analyzeEmailWithGPT:', error)
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      })
    }
    return {
      riskLevel: 'Medium',
      reason: 'Kunne ikke analysere e-posten på grunn av en teknisk feil. Vær ekstra oppmerksom.'
    }
  }
}

function normalizeRiskLevel(level: string): RiskLevel {
  // Convert to lowercase for comparison
  const normalized = level.toLowerCase().trim()
  
  if (normalized === 'lav' || normalized === 'low') {
    return 'Lav'
  }
  if (normalized === 'høy' || normalized === 'high' || normalized === 'hoy') {
    return 'Høy'
  }
  return 'Medium'
}

async function getEmailBody(payload: any): Promise<string> {
  try {
    console.log('Extracting email body from payload structure:', JSON.stringify({
      mimeType: payload.mimeType,
      hasBody: !!payload.body,
      hasParts: !!payload.parts,
      partsCount: payload.parts?.length,
      partTypes: payload.parts?.map((p: any) => p.mimeType)
    }, null, 2))

    // Function to recursively search for text content in parts
    const findTextContent = (part: any): string | null => {
      // If this part has data, try to decode it
      if (part.body?.data) {
        try {
          return Buffer.from(part.body.data, 'base64').toString()
        } catch (e) {
          console.error('Failed to decode part data:', e)
          return null
        }
      }

      // If this part has nested parts, search them
      if (part.parts) {
        for (const subPart of part.parts) {
          const content = findTextContent(subPart)
          if (content) return content
        }
      }

      return null
    }

    // First try to find plain text content
    const findContentByMimeType = (mimeType: string): string | null => {
      if (payload.parts) {
        for (const part of payload.parts) {
          if (part.mimeType === mimeType) {
            const content = findTextContent(part)
            if (content) return content
          }
          // Check nested parts
          if (part.parts) {
            for (const subPart of part.parts) {
              if (subPart.mimeType === mimeType) {
                const content = findTextContent(subPart)
                if (content) return content
              }
            }
          }
        }
      }
      return null
    }

    // Try plain text first
    let content = findContentByMimeType('text/plain')
    
    // If no plain text, try HTML
    if (!content) {
      content = findContentByMimeType('text/html')
      if (content) {
        // Basic HTML to text conversion
        content = content
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags and content
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags and content
          .replace(/<[^>]*>/g, '') // Remove remaining HTML tags
          .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
          .replace(/&[a-z]+;/g, '') // Remove other HTML entities
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim()
      }
    }

    // If still no content, try direct body
    if (!content && payload.body?.data) {
      try {
        content = Buffer.from(payload.body.data, 'base64').toString()
      } catch (e) {
        console.error('Failed to decode direct body:', e)
      }
    }

    if (!content || content.trim().length === 0) {
      console.warn('No content found in email payload')
      return 'Ingen e-postinnhold funnet'
    }

    return content
  } catch (error) {
    console.error('Error getting email body:', error)
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack
      })
    }
    return 'Feil ved henting av e-postinnhold'
  }
}

export async function POST() {
  try {
    console.log('1. Starting email analysis process...')
    
    // Check all required environment variables
    const requiredEnvVars = {
      'OPENAI_API_KEY': process.env.OPENAI_API_KEY,
      'NEXT_PUBLIC_GOOGLE_CLIENT_ID': process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      'GOOGLE_CLIENT_SECRET': process.env.GOOGLE_CLIENT_SECRET,
      'NEXT_PUBLIC_SITE_URL': process.env.NEXT_PUBLIC_SITE_URL
    }

    const missingVars = Object.entries(requiredEnvVars)
      .filter(([_, value]) => !value)
      .map(([key]) => key)

    if (missingVars.length > 0) {
      console.error('Missing required environment variables:', missingVars)
      return NextResponse.json(
        { error: `Missing required environment variables: ${missingVars.join(', ')}` },
        { status: 500 }
      )
    }

    console.log('Environment variables check passed')
    
    // Test OpenAI connection first
    const apiKey = process.env.OPENAI_API_KEY!
    console.log('2. Testing OpenAI connection...')
    const isConnected = await testOpenAIConnection(apiKey)
    if (!isConnected) {
      console.error('Failed to connect to OpenAI API')
      return NextResponse.json(
        { error: 'Could not connect to OpenAI API' },
        { status: 500 }
      )
    }
    console.log('3. OpenAI connection test successful')

    const supabase = createApiClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('Session error:', sessionError)
      return NextResponse.json({ error: 'Session error' }, { status: 401 })
    }

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('4. Got authenticated session')

    // Get Gmail tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from('gmail_tokens')
      .select('access_token, refresh_token')
      .eq('user_id', session.user.id)
      .single()

    if (tokenError) {
      console.error('Token error:', tokenError)
      return NextResponse.json(
        { error: 'Gmail tokens not found' },
        { status: 404 }
      )
    }

    if (!tokenData) {
      return NextResponse.json(
        { error: 'No Gmail tokens available' },
        { status: 404 }
      )
    }

    console.log('5. Got Gmail tokens')

    // Set up Gmail client
    oauth2Client.setCredentials({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
    })
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Get last 10 emails
    console.log('6. Fetching emails from Gmail...')
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 10,
    }).catch(error => {
      console.error('Gmail API error:', error)
      throw new Error(`Gmail API error: ${error.message}`)
    })

    if (!response.data.messages) {
      console.log('No messages found in Gmail')
      return NextResponse.json({ newAnalyzedEmails: 0, emails: [] })
    }

    console.log('7. Got email list from Gmail:', response.data.messages.length, 'messages')

    // Get existing email IDs
    const { data: existingEmails, error: existingError } = await supabase
      .from('emails')
      .select('id')
      .eq('user_id', session.user.id)

    if (existingError) {
      console.error('Error fetching existing emails:', existingError)
      throw existingError
    }

    console.log('8. Got existing email IDs from database')

    const existingIds = new Set(existingEmails?.map(e => e.id) || [])
    const newEmails = []
    const errors = []

    console.log('9. Starting to process emails...')
    // Process each new email
    for (const message of response.data.messages) {
      try {
        console.log(`Processing email ${message.id}...`)
        if (!existingIds.has(message.id!)) {
          // Get full email content
          console.log(`10. Fetching full content for email ${message.id}`)
          const email = await gmail.users.messages.get({
            userId: 'me',
            id: message.id!,
            format: 'full',
          }).catch(error => {
            console.error(`Error fetching email ${message.id}:`, error)
            throw new Error(`Gmail get message error: ${error.message}`)
          })

          const headers = email.data.payload?.headers
          const from = headers?.find(h => h.name === 'From')?.value || ''
          const subject = headers?.find(h => h.name === 'Subject')?.value || ''
          const date = headers?.find(h => h.name === 'Date')?.value || ''
          
          console.log(`11. Got email content for ${message.id}`)
          
          // Get email body
          const body = await getEmailBody(email.data.payload)
          console.log(`12. Extracted body for ${message.id}, length:`, body.length)

          // Analyze with GPT
          console.log(`13. Starting analysis for ${message.id}...`)
          const analysis = await analyzeEmailWithGPT(
            `From: ${from}\nSubject: ${subject}\n\n${body}`
          )
          console.log(`14. Completed analysis for ${message.id}:`, analysis)

          // Store in database
          console.log(`15. Storing email ${message.id} in database`)
          const { data: emailData, error: emailError } = await supabase
            .from('emails')
            .upsert({
              id: message.id,
              user_id: session.user.id,
              from_address: from,
              subject,
              date: new Date(date).toISOString(),
              body,
              ai_risk_level: analysis.riskLevel,
              ai_reason: analysis.reason,
            }, {
              onConflict: 'id',
              ignoreDuplicates: false
            })
            .select()
            .single()

          if (emailError) {
            console.error('Error storing email:', emailError)
            errors.push({
              id: message.id,
              error: 'Kunne ikke lagre e-post'
            })
            continue
          }

          console.log(`16. Successfully stored email ${message.id} in database`)
          if (emailData) {
            newEmails.push(emailData)
          }
        } else {
          console.log(`Email ${message.id} already exists, skipping...`)
        }
      } catch (error) {
        console.error(`Error processing email ${message.id}:`, error)
        errors.push({
          id: message.id,
          error: error instanceof Error ? error.message : 'Kunne ikke prosessere e-post'
        })
        continue
      }
    }

    console.log('17. Completed processing all emails')
    console.log('New emails:', newEmails.length)
    console.log('Errors:', errors.length)
    
    return NextResponse.json({
      newAnalyzedEmails: newEmails.length,
      emails: newEmails,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('Error analyzing emails:', error)
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze emails' },
      { status: 500 }
    )
  }
} 