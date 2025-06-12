import { createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  
  try {
    const code = requestUrl.searchParams.get('code')
    
    if (code) {
      const supabase = createServerClient()

      // Exchange the code for a session
      const { error: signInError } = await supabase.auth.exchangeCodeForSession(code)
      
      if (signInError) {
        console.error('Sign in error:', signInError)
        // Check if error is related to code verifier or auth code
        if (signInError.message?.toLowerCase().includes('code verifier') || 
            signInError.message?.toLowerCase().includes('auth code')) {
          return NextResponse.redirect(`${requestUrl.origin}/dashboard/integrations?error=session_expired`)
        }
        return NextResponse.redirect(`${requestUrl.origin}/dashboard/integrations?error=auth_error&details=${encodeURIComponent(signInError.message)}`)
      }

      // Get the session to verify it worked
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session?.provider_token) {
        console.error('Session error:', sessionError)
        return NextResponse.redirect(`${requestUrl.origin}/dashboard/integrations?error=auth_error`)
      }

      try {
        // Store the tokens
        const { error: upsertError } = await supabase
          .from('gmail_tokens')
          .upsert({
            user_id: session.user.id,
            access_token: session.provider_token,
            refresh_token: session.provider_refresh_token || '',
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id'
          })

        if (upsertError) {
          console.error('Token storage error:', upsertError)
          throw upsertError
        }

        return NextResponse.redirect(`${requestUrl.origin}/dashboard/integrations?success=true`)
      } catch (error) {
        console.error('Error storing tokens:', error)
        return NextResponse.redirect(`${requestUrl.origin}/dashboard/integrations?error=token_store_error`)
      }
    }

    return NextResponse.redirect(`${requestUrl.origin}/dashboard/integrations?error=no_code`)
  } catch (error) {
    console.error('Callback error:', error)
    return NextResponse.redirect(`${requestUrl.origin}/dashboard/integrations?error=unexpected_error`)
  }
} 