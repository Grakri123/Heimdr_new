import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.json({ error: 'Missing code param' }, { status: 400 })
  }

  if (!process.env.OUTLOOK_REDIRECT_URI) {
    return NextResponse.json({ error: 'Missing OUTLOOK_REDIRECT_URI configuration' }, { status: 500 })
  }

  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.OUTLOOK_CLIENT_ID!,
      client_secret: process.env.OUTLOOK_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: process.env.OUTLOOK_REDIRECT_URI,
    }),
  })

  const tokenData = await tokenRes.json()

  if (!tokenData.access_token) {
    console.error('Token exchange failed:', tokenData)
    return NextResponse.json({ error: 'Failed to get token', details: tokenData }, { status: 500 })
  }

  // Fetch user's email from Microsoft Graph
  const graphRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json'
    }
  })

  const graphData = await graphRes.json()
  const userEmail = graphData.mail || graphData.userPrincipalName

  if (!userEmail) {
    console.error('Failed to get user email:', graphData)
    return NextResponse.json({ error: 'Failed to get user email' }, { status: 500 })
  }

  // Store in Supabase
  const supabase = createServerClient()
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()

  if (sessionError || !session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Store the tokens
  const { error: insertError } = await supabase
    .from('outlook_tokens')
    .insert({
      user_id: session.user.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      email: userEmail,
      updated_at: new Date().toISOString()
    })

  if (insertError) {
    console.error('Failed to store token:', insertError)
    return NextResponse.json({ error: 'Failed to store token' }, { status: 500 })
  }

  // Redirect back to the app
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`)
} 