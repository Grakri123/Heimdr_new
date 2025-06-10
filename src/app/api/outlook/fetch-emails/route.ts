import { createApiClient } from '@/lib/supabase/server'
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

export async function GET(req: Request) {
  const supabase = createApiClient()

  // 👉 Forsøk å hente fra header (Edge Function-kall)
  const userIdHeader = req.headers.get('x-user-id')
  const tokenHeader = req.headers.get('x-provider-token')

  let userId = userIdHeader || null
  let accessToken = tokenHeader || null

  if (!userId || !accessToken) {
    // 👉 Fallback til session (frontend-kall)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session?.user) {
      console.log('📧 Outlook: Ingen bruker (hverken fra session eller header)')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    userId = session.user.id

    // Hent token fra Supabase
    const { data: tokenData } = await supabase
      .from('outlook_tokens')
      .select('access_token')
      .eq('user_id', userId)
      .single()

    if (!tokenData) {
      return NextResponse.json({ error: 'Outlook token not found' }, { status: 404 })
    }

    accessToken = tokenData.access_token
  }

  // Fetch eposter fra Outlook
  const response = await fetch('https://graph.microsoft.com/v1.0/me/messages?' + new URLSearchParams({
    $select: 'id,subject,bodyPreview,body,from,receivedDateTime',
    $orderby: 'receivedDateTime desc',
    $top: '10',
  }), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  const data = await response.json()

  if (!response.ok) {
    console.error('📧 Outlook API-feil:', data)
    return NextResponse.json({ error: 'Failed to fetch emails from Outlook' }, { status: response.status })
  }

  const existing = await supabase
    .from('emails')
    .select('message_id, analyzed_at')
    .eq('user_id', userId)
    .eq('source', 'outlook')

  const existingMap = new Map(existing.data?.map(e => [e.message_id, e.analyzed_at !== null]) || [])
  const newEmails = []
  const analysisErrors = []

  for (const msg of data.value || []) {
    if (existingMap.get(msg.id)) continue

    const email = {
      id: msg.id,
      user_id: userId,
      from_address: msg.from?.emailAddress?.address || '',
      subject: msg.subject || '',
      date: msg.receivedDateTime,
      body: htmlToPlainText(msg.body?.content || msg.bodyPreview || ''),
      source: 'outlook',
      message_id: msg.id,
      created_at: new Date().toISOString(),
      analyzed_at: null,
      ai_risk_level: null,
      ai_reason: null,
    }

    const { error: upsertError } = await supabase.from('emails').upsert(email, { onConflict: 'id' })
    if (upsertError) {
      console.error(`📧 Feil ved lagring: ${msg.id}`, upsertError)
      continue
    }

    newEmails.push(email)

    try {
      const content = `From: ${email.from_address}\nSubject: ${email.subject}\n\n${email.body}`
      await analyzeNewEmail(supabase, msg.id, content)
    } catch (err) {
      console.error(`❌ Feil ved analyse av ${msg.id}`, err)
      analysisErrors.push({ id: msg.id, error: err instanceof Error ? err.message : 'Ukjent feil' })
    }
  }

  return NextResponse.json({
    newEmails: newEmails.length,
    emails: newEmails,
    analysisErrors: analysisErrors.length > 0 ? analysisErrors : undefined,
  })
}
