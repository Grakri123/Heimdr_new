import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'

function base64URLEncode(buffer: Buffer): string {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function sha256(buffer: Buffer): Buffer {
  return createHash('sha256').update(buffer).digest()
}

export async function GET(request: NextRequest) {
  // Verify required environment variables
  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
    return Response.json(
      { error: 'Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID configuration' },
      { status: 500 }
    )
  }

  if (!process.env.NEXT_PUBLIC_SITE_URL) {
    return Response.json(
      { error: 'Missing NEXT_PUBLIC_SITE_URL configuration' },
      { status: 500 }
    )
  }

  // Generate PKCE challenge
  const verifier = base64URLEncode(randomBytes(32))
  const challenge = base64URLEncode(sha256(Buffer.from(verifier)))

  // Set up OAuth parameters
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256'
  })

  // Build the Google OAuth URL
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

  // Sett code_verifier i cookie og redirect
  const response = NextResponse.redirect(authUrl)
  response.cookies.set('code_verifier', verifier, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: 600
  })
  return response
} 