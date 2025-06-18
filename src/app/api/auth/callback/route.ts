import { createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(`${requestUrl.origin}/dashboard?error=no_code`)
  }

  // Hent code_verifier fra cookie
  const codeVerifier = request.cookies.get('code_verifier')?.value
  console.log('code_verifier from cookie:', codeVerifier)
  if (!codeVerifier) {
    console.error('Missing code_verifier in callback cookies!')
    return NextResponse.redirect(`${requestUrl.origin}/dashboard?error=missing_code_verifier`)
  }

  // Hent session for å finne user_id
  const supabase = createServerClient()
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session?.user?.id) {
    console.error('No supabase session or user id:', sessionError)
    return NextResponse.redirect(`${requestUrl.origin}/dashboard?error=no_user`)
  }
  const userId = session.user.id

  // Bytt ut PKCE/Supabase Auth med direkte Google token exchange
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback`,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier
    })
  })
  const tokenData = await tokenRes.json()
  console.log('Google token response:', tokenData)

  if (!tokenData.access_token) {
    console.error('No access_token from Google:', tokenData)
    return NextResponse.redirect(`${requestUrl.origin}/dashboard?error=no_access_token`)
  }

  // Hent e-postadressen til brukeren fra Google
  let gmailEmail = null
  try {
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`
      }
    })
    const userInfo = await userInfoRes.json()
    gmailEmail = userInfo.email || null
    console.log('Fetched Gmail user email:', gmailEmail)
  } catch (err) {
    console.error('Failed to fetch Gmail user email:', err)
  }

  // Lagre tokens og e-post i gmail_tokens
  const { error: upsertError } = await supabase
    .from('gmail_tokens')
    .upsert({
      user_id: userId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || '',
      email: gmailEmail,
      updated_at: new Date().toISOString(),
      expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null
    }, {
      onConflict: 'user_id'
    })
  if (upsertError) {
    console.error('Token storage error:', upsertError)
    return NextResponse.redirect(`${requestUrl.origin}/dashboard?error=token_store_error`)
  }
  console.log('Gmail tokens upserted successfully!')
  return NextResponse.redirect(`${requestUrl.origin}/dashboard?success=true`)
} 