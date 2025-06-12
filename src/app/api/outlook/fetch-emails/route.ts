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
  const supabase = createApiClient()

  // 👉 Forsøk å hente fra header (Edge Function-kall)
  const userIdHeader = req.headers.get('x-user-id')
  const tokenHeader = req.headers.get('x-provider-token')

  let userId = userIdHeader || null
  let accessToken = tokenHeader || null
  let refreshToken: string | null = null

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
      .select('access_token, refresh_token')
      .eq('user_id', userId)
      .single()

    if (!tokenData) {
      return NextResponse.json({ error: 'Outlook token not found' }, { status: 404 })
    }

    accessToken = tokenData.access_token
    refreshToken = tokenData.refresh_token
  } else {
    // Hvis vi bruker header-provided token, hent refresh token fra databasen
    const { data: tokenData } = await supabase
      .from('outlook_tokens')
      .select('refresh_token')
      .eq('user_id', userId)
      .single()
    
    refreshToken = tokenData?.refresh_token || null
  }

  // Fetch eposter fra Outlook
  let response = await fetch('https://graph.microsoft.com/v1.0/me/messages?' + new URLSearchParams({
    $select: 'id,subject,bodyPreview,body,from,receivedDateTime',
    $orderby: 'receivedDateTime desc',
    $top: '10',
  }), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  // If token is expired, try to refresh it
  if (!response.ok && response.status === 401 && refreshToken) {
    console.log('📧 Outlook: Token expired, attempting refresh...')
    const newAccessToken = await refreshOutlookToken(supabase, userId!, refreshToken)
    
    if (!newAccessToken) {
      return NextResponse.json(
        { error: 'Outlook authentication failed - please reconnect your account' },
        { status: 401 }
      )
    }

    // Retry with new token
    accessToken = newAccessToken
    response = await fetch('https://graph.microsoft.com/v1.0/me/messages?' + new URLSearchParams({
      $select: 'id,subject,bodyPreview,body,from,receivedDateTime',
      $orderby: 'receivedDateTime desc',
      $top: '10',
    }), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })
  }

  const data = await response.json()

  if (!response.ok) {
    console.error('📧 Outlook API-feil:', data)
    if (response.status === 401) {
      return NextResponse.json(
        { error: 'Outlook authentication failed - please reconnect your account' },
        { status: 401 }
      )
    }
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
