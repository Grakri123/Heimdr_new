import { NextRequest } from 'next/server'
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

  // Store verifier in cookie for later use
  const cookieStore = request.cookies
  const response = new Response()
  response.headers.set(
    'Set-Cookie',
    `code_verifier=${verifier}; Path=/; HttpOnly; SameSite=Lax; Secure`
  )

  // Set up OAuth parameters
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256'
  })

  // Build the Google OAuth URL
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  
  // Set the redirect URL in the response
  response.headers.set('Location', authUrl)
  return response
} 