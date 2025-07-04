import { type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Verify required environment variables
  if (!process.env.OUTLOOK_CLIENT_ID) {
    return Response.json(
      { error: 'Missing OUTLOOK_CLIENT_ID configuration' },
      { status: 500 }
    )
  }

  if (!process.env.OUTLOOK_REDIRECT_URI) {
    return Response.json(
      { error: 'Missing OUTLOOK_REDIRECT_URI configuration' },
      { status: 500 }
    )
  }

  // Set up OAuth parameters
  const params = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.OUTLOOK_REDIRECT_URI,
    response_mode: 'query',
    scope: 'offline_access Mail.Read User.Read',
    prompt: 'consent'
  })

  // Build the Microsoft OAuth URL
  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
  
  // Redirect to Microsoft login
  return Response.redirect(authUrl)
} 