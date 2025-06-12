import { NextRequest } from 'next/server'

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

  // Set up OAuth parameters
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent'
  })

  // Build the Google OAuth URL
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  
  // Redirect to Google login
  return Response.redirect(authUrl)
} 