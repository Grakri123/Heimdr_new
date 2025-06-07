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
    console.log('🔍 Testing OpenAI connection...')
    const openai = new OpenAI({ apiKey })
    await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Test connection' }],
      max_tokens: 5
    })
    console.log('✅ OpenAI connection test successful')
    return true
  } catch (error) {
    console.error('❌ OpenAI connection test failed:', error)
    return false
  }
}

async function analyzeEmailWithGPT(emailContent: string): Promise<AnalysisResponse> {
  try {
    console.log('🔍 Starting GPT analysis...')
    
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.error('❌ OpenAI API key is not set')
      throw new Error('OpenAI API key is not configured')
    }

    console.log('📧 Email content length:', emailContent.length)
    console.log('📧 Email content preview:', emailContent.substring(0, 100) + '...')

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

    console.log('🤖 Sending request to OpenAI...')
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

    console.log('✅ Received response from OpenAI')
    const responseContent = completion.choices[0].message.content
    console.log('📝 Raw GPT response:', responseContent)

    try {
      const response = JSON.parse(responseContent.trim()) as AnalysisResponse
      console.log('✅ Successfully parsed GPT response:', response)
      
      return {
        riskLevel: normalizeRiskLevel(response.riskLevel),
        reason: response.reason || 'Ingen begrunnelse tilgjengelig'
      }
    } catch (parseError) {
      console.error('❌ Failed to parse GPT response:', parseError)
      console.error('Raw response that failed parsing:', responseContent)
      throw new Error('Could not parse OpenAI response as JSON')
    }
  } catch (error) {
    console.error('❌ Error in analyzeEmailWithGPT:', error)
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      })
    }
    throw error // Re-throw to be handled by caller
  }
}

function normalizeRiskLevel(level: string): RiskLevel {
  console.log('🔄 Normalizing risk level:', level)
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
    console.log('🚀 Starting email analysis process...')
    
    // Check OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.error('❌ OpenAI API key is missing')
      return NextResponse.json(
        { error: 'OpenAI API key is not configured' },
        { status: 500 }
      )
    }
    console.log('✅ OpenAI API key is configured')

    // Test OpenAI connection
    console.log('🔍 Testing OpenAI connection...')
    const isConnected = await testOpenAIConnection(apiKey)
    if (!isConnected) {
      console.error('❌ Could not connect to OpenAI')
      return NextResponse.json(
        { error: 'Could not connect to OpenAI API' },
        { status: 500 }
      )
    }
    console.log('✅ OpenAI connection test passed')

    // Get Supabase session
    const supabase = createApiClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('❌ Session error:', sessionError)
      return NextResponse.json({ error: 'Session error' }, { status: 401 })
    }

    if (!session?.user) {
      console.error('❌ No authenticated user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('✅ Got authenticated session for user:', session.user.id)

    // Get unanalyzed emails
    console.log('🔍 Fetching unanalyzed emails...')
    const { data: unanalyzedEmails, error: emailsError } = await supabase
      .from('emails')
      .select('*')
      .eq('user_id', session.user.id)
      .is('analyzed_at', null)
      .order('date', { ascending: false })

    if (emailsError) {
      console.error('❌ Error fetching unanalyzed emails:', emailsError)
      throw emailsError
    }

    console.log('📊 Unanalyzed emails query result:', {
      count: unanalyzedEmails?.length || 0,
      firstEmailId: unanalyzedEmails?.[0]?.id,
      hasContent: unanalyzedEmails?.some(e => e.body && e.subject && e.from_address)
    })

    if (!unanalyzedEmails || unanalyzedEmails.length === 0) {
      console.log('ℹ️ No unanalyzed emails found')
      return NextResponse.json({ 
        newAnalyzedEmails: 0,
        message: 'Ingen nye e-poster å analysere'
      })
    }

    console.log(`📧 Found ${unanalyzedEmails.length} unanalyzed emails`)

    const analyzedEmails = []
    const errors = []

    // Process each unanalyzed email
    for (const email of unanalyzedEmails) {
      try {
        console.log(`\n🔄 Processing email ${email.id}...`)
        console.log('Email details:', {
          id: email.id,
          hasBody: !!email.body,
          bodyLength: email.body?.length,
          hasSubject: !!email.subject,
          hasFrom: !!email.from_address
        })
        
        // Validate email content
        if (!email.body || !email.subject || !email.from_address) {
          console.warn(`⚠️ Skipping email ${email.id} - Missing required content`)
          errors.push({
            id: email.id,
            error: 'Mangler nødvendig innhold for analyse'
          })
          continue
        }

        // Prepare email content for analysis
        const emailContent = `From: ${email.from_address}\nSubject: ${email.subject}\n\n${email.body}`
        
        // Analyze with GPT
        console.log(`🤖 Starting analysis for email ${email.id}...`)
        const analysis = await analyzeEmailWithGPT(emailContent)
        console.log(`✅ Analysis completed for ${email.id}:`, analysis)

        // Update email with analysis results
        console.log(`💾 Updating email ${email.id} with analysis results...`)
        const { error: updateError } = await supabase
          .from('emails')
          .update({
            ai_risk_level: analysis.riskLevel,
            ai_reason: analysis.reason,
            analyzed_at: new Date().toISOString()
          })
          .eq('id', email.id)

        if (updateError) {
          console.error(`❌ Error updating email ${email.id}:`, updateError)
          errors.push({
            id: email.id,
            error: 'Kunne ikke lagre analyseresultat'
          })
          continue
        }

        console.log(`✅ Successfully updated email ${email.id}`)
        analyzedEmails.push({
          ...email,
          ai_risk_level: analysis.riskLevel,
          ai_reason: analysis.reason
        })
      } catch (error) {
        console.error(`❌ Error processing email ${email.id}:`, error)
        if (error instanceof Error) {
          console.error('Detailed error:', {
            name: error.name,
            message: error.message,
            stack: error.stack
          })
        }
        errors.push({
          id: email.id,
          error: error instanceof Error ? error.message : 'Kunne ikke analysere e-post'
        })
      }
    }

    console.log('\n📊 Analysis process summary:', {
      totalEmails: unanalyzedEmails.length,
      successfullyAnalyzed: analyzedEmails.length,
      errors: errors.length
    })
    
    return NextResponse.json({
      newAnalyzedEmails: analyzedEmails.length,
      emails: analyzedEmails,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('❌ Fatal error in analyze-emails route:', error)
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze emails' },
      { status: 500 }
    )
  }
} 