import { createServerClient } from '@/lib/supabase/server'
import { google } from 'googleapis'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/supabase'
import { analyzeNewEmail } from '@/lib/email/analyze'

// Add dynamic route configuration
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const oauth2Client = new google.auth.OAuth2(
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/integrations`
)

// Helper function to refresh token and update in Supabase if needed
async function refreshAccessToken(supabase: any, userId: string, currentRefreshToken?: string) {
  try {
    if (!currentRefreshToken) {
      // Try to get refresh token from database if not provided
      const { data: tokenData, error: tokenError } = await supabase
        .from('gmail_tokens')
        .select('refresh_token')
        .eq('user_id', userId)
        .single()

      if (tokenError || !tokenData?.refresh_token) {
        console.log('📬 Gmail: No refresh token available for refresh attempt')
        return null
      }
      currentRefreshToken = tokenData.refresh_token
    }

    // Set refresh token and attempt refresh
    oauth2Client.setCredentials({
      refresh_token: currentRefreshToken
    })

    const { credentials } = await oauth2Client.refreshAccessToken()
    const newAccessToken = credentials.access_token
    
    if (!newAccessToken) {
      console.log('📬 Gmail: Token refresh failed - no new token received')
      return null
    }

    // Update token in database
    const { error: updateError } = await supabase
      .from('gmail_tokens')
      .update({ 
        access_token: newAccessToken,
        refresh_token: credentials.refresh_token || currentRefreshToken, // Use new refresh token if provided
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)

    if (updateError) {
      console.error('📬 Gmail: Failed to update refreshed token in database:', updateError)
      return null
    }

    console.log('📬 Gmail: Successfully refreshed and updated access token')
    return newAccessToken
  } catch (error) {
    console.error('📬 Gmail: Token refresh failed:', error)
    return null
  }
}

// Helper function to execute Gmail API call with retry on token error
async function executeGmailApiCall<T>(apiCall: () => Promise<T>, supabase: any, userId: string): Promise<T> {
  try {
    return await apiCall()
  } catch (error: any) {
    // Check if error is due to invalid token
    if (error?.message?.includes('invalid_token') || error?.message?.includes('Invalid Credentials')) {
      console.log('📬 Gmail: Token error detected, attempting refresh...')
      const newAccessToken = await refreshAccessToken(supabase, userId)
      
      if (!newAccessToken) {
        throw new Error('Failed to refresh access token')
      }

      // Update client credentials and retry
      oauth2Client.setCredentials({ access_token: newAccessToken })
      return await apiCall()
    }
    throw error
  }
}

export async function GET(req: Request) {
  try {
    const supabase = createServerClient()

    // 👉 Try to get from header (Edge Function call)
    const userIdHeader = req.headers.get('x-user-id')
    const tokenHeader = req.headers.get('x-provider-token')

    let userId = userIdHeader || null
    let accessToken = tokenHeader || null
    let refreshToken: string | undefined

    if (!userId || !accessToken) {
      // 👉 Fallback to session (frontend call)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session?.user) {
        console.log('📬 Gmail: No user found (neither from session nor header)')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      userId = session.user.id

      // Get tokens from Supabase
      const { data: tokenData, error: tokenError } = await supabase
        .from('gmail_tokens')
        .select('access_token, refresh_token')
        .eq('user_id', userId)
        .single()

      if (tokenError || !tokenData) {
        console.log('📬 Gmail: No token found')
        return NextResponse.json(
          { error: 'Gmail token not found' },
          { status: 404 }
        )
      }

      accessToken = tokenData.access_token
      refreshToken = tokenData.refresh_token
      
      // Set up OAuth2 client with tokens
      oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
    } else {
      // Using header-provided token
      oauth2Client.setCredentials({
        access_token: accessToken
      })
    }

    console.log('📬 Gmail: User ID =', userId)
    console.log('📬 Gmail: access_token =', accessToken.substring(0, 10) + '... (truncated)')

    // Create Gmail API client
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Fetch last 10 emails with automatic token refresh if needed
    const response = await executeGmailApiCall(
      () => gmail.users.messages.list({
        userId: 'me',
        maxResults: 10,
      }),
      supabase,
      userId
    )

    console.log('📬 Gmail: Status =', response.status)
    console.log('📬 Gmail: API-respons =', JSON.stringify(response.data, null, 2))

    if (!response.data.messages) {
      console.log('📬 Gmail: Ingen e-poster funnet')
      return NextResponse.json({ emails: [] })
    }

    // Get existing email IDs to avoid duplicates
    const { data: existingEmails, error: existingError } = await supabase
      .from('emails')
      .select('message_id, analyzed_at')
      .eq('user_id', userId)
      .eq('source', 'gmail')

    if (existingError) {
      console.error('📬 Gmail: Feil ved henting av eksisterende e-poster:', existingError)
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
    for (const message of response.data.messages) {
      // Skip only if email exists AND has been analyzed
      if (existingEmailMap.has(message.id) && existingEmailMap.get(message.id)) {
        skippedCount++
        continue
      }

      try {
        const email = await executeGmailApiCall(
          () => gmail.users.messages.get({
            userId: 'me',
            id: message.id!,
            format: 'full',
          }),
          supabase,
          userId
        )

        const headers = email.data.payload?.headers
        const from = headers?.find((h) => h.name === 'From')?.value || ''
        const subject = headers?.find((h) => h.name === 'Subject')?.value || ''
        const date = headers?.find((h) => h.name === 'Date')?.value || ''

        // Get email body
        const body = await getEmailBody(email.data.payload)

        const emailData = {
          id: message.id,
          user_id: userId,
          from_address: from,
          subject,
          date: new Date(date).toISOString(),
          body,
          source: 'gmail',
          message_id: message.id,
          created_at: new Date().toISOString(),
          analyzed_at: null,
          ai_risk_level: null,
          ai_reason: null
        }

        // Store in database using upsert
        const { error: upsertError } = await supabase
          .from('emails')
          .upsert(emailData, {
            onConflict: 'id',
            ignoreDuplicates: false
          })

        if (upsertError) {
          console.error('📬 Gmail: Error saving email:', message.id, upsertError)
          continue
        }

        console.log('📬 Gmail: Saved/updated email:', message.id, '(analyzed_at reset)')
        newEmails.push(emailData)

        // Analyze the new email
        try {
          console.log(`📊 Preparing analysis of email ${message.id}:`, {
            hasFrom: !!from,
            hasSubject: !!subject,
            bodyLength: body?.length || 0
          })
          
          const emailContent = `From: ${from}\nSubject: ${subject}\n\n${body}`
          console.log(`🤖 Starting analysis of email ${message.id}...`)
          await analyzeNewEmail(supabase, message.id, emailContent)
          console.log(`✅ Analysis completed for email ${message.id}`)
        } catch (analysisError) {
          console.error(`