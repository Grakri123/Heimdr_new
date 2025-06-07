import { createApiClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { analyzeNewEmail } from '@/lib/email/analyze'

export const dynamic = 'force-dynamic'

// Helper function to convert HTML to plain text
function htmlToPlainText(html: string): string {
  try {
    // Remove style/script tags and their content
    let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                   .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    
    // Replace common HTML entities
    text = text.replace(/&nbsp;/g, ' ')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#x27;/g, "'")
              .replace(/&mdash;/g, '—')
              .replace(/&ndash;/g, '–')
    
    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, '')
    
    // Fix whitespace
    text = text.replace(/\s+/g, ' ')
              .replace(/^\s+|\s+$/g, '')
    
    // Decode any remaining HTML entities
    text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    
    return text
  } catch (error) {
    console.error('❌ Feil ved konvertering av HTML til tekst:', error)
    return 'Kunne ikke konvertere HTML-innhold til tekst'
  }
}

export async function GET() {
  try {
    const supabase = createApiClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('📧 Outlook: Sesjonsfeil:', sessionError)
      return NextResponse.json({ error: 'Session error' }, { status: 401 })
    }

    if (!session?.user) {
      console.log('📧 Outlook: Ingen bruker funnet')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('📧 Outlook: Bruker ID =', session.user.id)

    // Fetch Outlook token from Supabase
    const { data: tokenData, error: tokenError } = await supabase
      .from('outlook_tokens')
      .select('access_token')
      .eq('user_id', session.user.id)
      .single()

    if (tokenError || !tokenData) {
      console.log('📧 Outlook: Ingen token funnet')
      return NextResponse.json(
        { error: 'Outlook token not found' },
        { status: 404 }
      )
    }

    console.log('📧 Outlook: access_token =', tokenData.access_token.substring(0, 10) + '... (trunkert)')

    // Get emails from Outlook
    const response = await fetch(
      'https://graph.microsoft.com/v1.0/me/messages?' + new URLSearchParams({
        $select: 'id,subject,bodyPreview,body,from,receivedDateTime',
        $orderby: 'receivedDateTime desc',
        $top: '10'  // Changed from 25 to 10 to match Gmail
      }), {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    )

    console.log('📧 Outlook: Status =', response.status)
    
    const data = await response.json()

    if (!response.ok) {
      console.error('📧 Outlook: API-feil =', JSON.stringify(data, null, 2))
      return NextResponse.json(
        { error: 'Failed to fetch emails from Outlook' },
        { status: response.status }
      )
    }

    console.log('📧 Outlook: API-respons =', JSON.stringify(data, null, 2))
    
    if (!data.value || !Array.isArray(data.value)) {
      console.log('📧 Outlook: Ingen e-poster funnet')
      return NextResponse.json({ emails: [] })
    }

    // Get existing email IDs to avoid duplicates
    const { data: existingEmails, error: existingError } = await supabase
      .from('emails')
      .select('message_id, analyzed_at')
      .eq('user_id', session.user.id)
      .eq('source', 'outlook')

    if (existingError) {
      console.error('📧 Outlook: Feil ved henting av eksisterende e-poster:', existingError)
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
    for (const message of data.value) {
      // Skip only if email exists AND has been analyzed
      if (existingEmailMap.has(message.id) && existingEmailMap.get(message.id)) {
        skippedCount++
        continue
      }

      const emailData = {
        id: message.id,
        user_id: session.user.id,
        from_address: message.from.emailAddress.address,
        subject: message.subject,
        date: message.receivedDateTime,
        body: htmlToPlainText(message.body?.content || message.bodyPreview || ''),
        source: 'outlook',
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
        console.error('📧 Outlook: Feil ved lagring av e-post:', message.id, upsertError)
        continue
      }

      console.log('📧 Outlook: Lagret/oppdaterte e-post:', message.id, '(analyzed_at nullstilt)')
      newEmails.push(emailData)

      // Analyze the new email
      try {
        console.log(`📊 Forbereder analyse av e-post ${message.id}:`, {
          hasFrom: !!emailData.from_address,
          hasSubject: !!emailData.subject,
          bodyLength: emailData.body?.length || 0
        })
        
        const emailContent = `From: ${emailData.from_address}\nSubject: ${emailData.subject}\n\n${emailData.body}`
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
    }

    console.log(`📧 Outlook: Fant ${data.value.length} e-poster. ${newEmails.length} nye ble lagret. ${skippedCount} eksisterte fra før.`)
    if (analysisErrors.length > 0) {
      console.log(`📧 Outlook: ${analysisErrors.length} e-poster kunne ikke analyseres:`, analysisErrors)
    }

    return NextResponse.json({
      newEmails: newEmails.length,
      emails: newEmails,
      analysisErrors: analysisErrors.length > 0 ? analysisErrors : undefined
    })
  } catch (error) {
    console.error('📧 Outlook: Uventet feil:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 