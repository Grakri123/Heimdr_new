import { createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)

  try {
    const code = requestUrl.searchParams.get('code')
    if (!code) {
      return NextResponse.redirect(`${requestUrl.origin}/dashboard/integrations?error=no_code`)
    }

    // Hent session for å finne user_id
    const supabase = createServerClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session?.user?.id) {
      console.error('No supabase session or user id:', sessionError)
      return NextResponse.redirect(`${requestUrl.origin}/dashboard/integrations?error=no_user`)
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
        grant_type: 'authorization_code'
      })
    })
    const tokenData = await tokenRes.json()
    console.log('Google token response:', tokenData)

    if (!tokenData.access_token) {
      console.error('No access_token from Google:', tokenData)
      return NextResponse.redirect(`${requestUrl.origin}/dashboard/integrations?error=no_access_token`)
    }

    // Lagre tokens i gmail_tokens
    const { error: upsertError } = await supabase
      .from('gmail_tokens')
      .upsert({
        user_id: userId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || '',
        updated_at: new Date().toISOString(),
        expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null
      }, {
        onConflict: 'user_id'
      })
    if (upsertError) {
      console.error('Token storage error:', upsertError)
      return NextResponse.redirect(`${requestUrl.origin}/dashboard/integrations?error=token_store_error`)
    }
    console.log('Gmail tokens upserted successfully!')
    return NextResponse.redirect(`${requestUrl.origin}/dashboard/integrations?success=true`)
  } catch (error) {
    console.error('Callback error:', error)
    return NextResponse.redirect(`${requestUrl.origin}/dashboard/integrations?error=unexpected_error`)
  }
} 