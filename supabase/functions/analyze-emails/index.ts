/*
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

interface AIResponse {
  riskLevel: 'Lav' | 'Medium' | 'Høy'
  reason: string
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!
const APP_URL = Deno.env.get('APP_URL') || 'https://heimdr.no'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function fetchFromEndpoint(userId: string, accessToken: string, endpoint: string) {
  try {
    const response = await fetch(`${APP_URL}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch from ${endpoint}: ${response.status}`)
    }
    
    const data = await response.json()
    console.log(`✅ Successfully fetched emails from ${endpoint} for user ${userId}`)
    return data
  } catch (error) {
    console.error(`❌ Error fetching from ${endpoint}:`, error)
    return null
  }
}

async function analyzeEmailWithGPT4(content: string): Promise<AIResponse> {
  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'Du er en ekspert på å analysere e-poster for svindel og skadelig innhold. Vurder risikoen og gi en kort begrunnelse på norsk. Du må være konsistent med risikonivåene og kun bruke: Lav, Medium, eller Høy. Svar kun med JSON.'
        },
        {
          role: 'user',
          content
        }
      ]
    })
  })

  if (!openaiRes.ok) {
    throw new Error(`OpenAI API error: ${openaiRes.status}`)
  }

  const analysis = await openaiRes.json()
  
  try {
    const aiResponse = JSON.parse(analysis.choices[0].message.content) as AIResponse
    
    // Validate response format
    if (!aiResponse.riskLevel || !aiResponse.reason || 
        !['Lav', 'Medium', 'Høy'].includes(aiResponse.riskLevel)) {
      throw new Error('Invalid AI response format')
    }
    
    return aiResponse
  } catch (error) {
    console.error('Failed to parse AI response:', analysis.choices[0].message.content)
    throw new Error('Failed to parse AI response')
  }
}

serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')
    if (authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), 
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 100
    })

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`)
    }

    let totalNewEmails = 0
    let totalAnalyzed = 0
    const errors = []

    for (const user of users || []) {
      try {
        // Get all unanalyzed emails for this user
        const { data: emails, error: emailError } = await supabase
          .from('emails')
          .select('*')
          .eq('user_id', user.id)
          .is('analyzed_at', null)

        if (emailError) {
          console.error(`❌ Failed to fetch emails for user ${user.id}:`, emailError)
          continue
        }

        console.log(`📧 Found ${emails?.length || 0} unanalyzed emails for user ${user.id}`)
        totalNewEmails += emails?.length || 0

        // Analyze each email
        for (const email of emails || []) {
          try {
            const content = `From: ${email.from_address}\nSubject: ${email.subject}\n\n${email.body}`
            const aiResponse = await analyzeEmailWithGPT4(content)

            const { error: updateError } = await supabase
              .from('emails')
              .update({
                ai_risk_level: aiResponse.riskLevel,
                ai_reason: aiResponse.reason,
                analyzed_at: new Date().toISOString()
              })
              .eq('id', email.id)

            if (updateError) {
              throw updateError
            }
            
            totalAnalyzed++
            console.log(`✅ Analyzed email ${email.id} with risk level: ${aiResponse.riskLevel}`)
            
          } catch (err) {
            console.error(`❌ Error analyzing email ${email.id} for user ${user.id}:`, err)
            errors.push({
              userId: user.id,
              error: err instanceof Error ? err.message : 'Error analyzing email'
            })
          }
        }
      } catch (err) {
        console.error(`❌ Error processing user ${user.id}:`, err)
        errors.push({
          userId: user.id,
          error: err instanceof Error ? err.message : 'Unknown error'
        })
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalNewEmails,
        totalAnalyzed,
        errors: errors.length > 0 ? errors : undefined,
        message: `Processed ${users?.length || 0} users. Found ${totalNewEmails} new emails. Analyzed ${totalAnalyzed} emails.`
      }),
      { 
        headers: { 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('❌ Unexpected error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}) 
  */
