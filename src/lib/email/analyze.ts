import OpenAI from 'openai'
import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/supabase'

type RiskLevel = 'Lav' | 'Medium' | 'Høy'

interface AnalysisResponse {
  riskLevel: RiskLevel
  reason: string
}

async function analyzeEmailWithGPT(emailContent: string): Promise<AnalysisResponse> {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.error('OpenAI API key is not set')
      throw new Error('OpenAI API key is not configured')
    }

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

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
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

    const responseContent = completion.choices[0].message.content
    const response = JSON.parse(responseContent.trim()) as AnalysisResponse
    
    return {
      riskLevel: normalizeRiskLevel(response.riskLevel),
      reason: response.reason || 'Ingen begrunnelse tilgjengelig'
    }
  } catch (error) {
    console.error('📉 AI Analyse: feil', error)
    throw error
  }
}

function normalizeRiskLevel(level: string): RiskLevel {
  const normalized = level.toLowerCase().trim()
  
  if (normalized === 'lav' || normalized === 'low') {
    return 'Lav'
  }
  if (normalized === 'høy' || normalized === 'high' || normalized === 'hoy') {
    return 'Høy'
  }
  return 'Medium'
}

export async function analyzeNewEmail(
  supabase: SupabaseClient<Database>,
  emailId: string,
  emailContent: string
): Promise<void> {
  try {
    console.log(`📝 Starter analyse av e-post ${emailId}...`)
    
    // Check if email exists and its analysis status
    const { data: existingEmail, error: checkError } = await supabase
      .from('emails')
      .select('analyzed_at, id')
      .eq('id', emailId)
      .single()

    if (checkError) {
      console.error(`❌ Feil ved sjekk av e-post ${emailId}:`, checkError)
      throw checkError
    }

    if (!existingEmail) {
      console.error(`❌ Fant ikke e-post ${emailId} i databasen`)
      throw new Error(`Email ${emailId} not found`)
    }

    console.log(`📊 E-post ${emailId} status:`, {
      exists: !!existingEmail,
      analyzed: !!existingEmail?.analyzed_at,
      contentLength: emailContent.length
    })

    // Proceed with analysis if not already analyzed
    if (!existingEmail.analyzed_at) {
      console.log(`🤖 Analyserer e-post ${emailId}...`)
      const analysis = await analyzeEmailWithGPT(emailContent)
      
      console.log(`✍️ Oppdaterer e-post ${emailId} med analyse:`, {
        riskLevel: analysis.riskLevel,
        reason: analysis.reason?.substring(0, 50) + '...'
      })

      // Update the email with analysis results
      const { error: updateError } = await supabase
        .from('emails')
        .update({
          ai_risk_level: analysis.riskLevel,
          ai_reason: analysis.reason,
          analyzed_at: new Date().toISOString()
        })
        .eq('id', emailId)

      if (updateError) {
        console.error(`❌ Feil ved oppdatering av e-post ${emailId}:`, updateError)
        throw updateError
      }

      console.log(`✅ E-post ${emailId} er analysert og oppdatert`)
    } else {
      console.log(`ℹ️ E-post ${emailId} er allerede analysert`)
    }
  } catch (error) {
    console.error(`❌ Feil ved analyse av e-post ${emailId}:`, error)
    if (error instanceof Error) {
      console.error('Detaljert feil:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      })
    }
    throw error
  }
} 