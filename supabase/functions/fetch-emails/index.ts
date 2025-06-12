import { serve } from 'std/http/server'
import { createClient } from '@supabase/supabase-js'

const BATCH_SIZE = 100
const APP_URL = Deno.env.get('APP_URL') || 'https://www.heimdr.no'

serve(async (req) => {
  // Only allow scheduled CRON invocations
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.includes('Bearer')) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    let page = 0
    let processedUsers = 0
    let hasMore = true
    const errors = []

    // Process users in batches
    while (hasMore) {
      const { data: { users } = {}, error } = await supabase.auth.admin.listUsers({
        page: page,
        perPage: BATCH_SIZE,
      })

      if (error) {
        console.error('Error fetching users:', error)
        throw error
      }

      if (!users || users.length === 0) {
        hasMore = false
        break
      }

      // Process each user in the current batch
      for (const user of users) {
        try {
          // Fetch Gmail emails
          const gmailTokens = await supabase
            .from('gmail_tokens')
            .select('access_token, refresh_token')
            .eq('user_id', user.id)
            .single()

          if (gmailTokens.data) {
            const gmailResponse = await fetch(`${APP_URL}/api/gmail/fetch-emails`, {
              headers: {
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                'X-User-Id': user.id,
                'X-Provider-Token': gmailTokens.data.access_token,
                'X-Client-Info': 'service_role',
              },
            })
            if (!gmailResponse.ok) {
              const errorText = await gmailResponse.text()
              console.error('Gmail Error Response:', errorText)
              errors.push({
                user_id: user.id,
                service: 'gmail',
                error: errorText,
              })
            }
          }

          // Fetch Outlook emails
          const outlookTokens = await supabase
            .from('outlook_tokens')
            .select('access_token')
            .eq('user_id', user.id)
            .single()

          if (outlookTokens.data) {
            const outlookResponse = await fetch(`${APP_URL}/api/outlook/fetch-emails`, {
              headers: {
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                'X-User-Id': user.id,
                'X-Provider-Token': outlookTokens.data.access_token,
                'X-Client-Info': 'service_role',
              },
            })
            if (!outlookResponse.ok) {
              const errorText = await outlookResponse.text()
              console.error('Outlook Error Response:', errorText)
              errors.push({
                user_id: user.id,
                service: 'outlook',
                error: errorText,
              })
            }
          }

          processedUsers++
        } catch (e) {
          console.error(`Error processing user ${user.id}:`, e)
          errors.push({
            user_id: user.id,
            error: e instanceof Error ? e.message : 'Unknown error'
          })
        }
      }

      page++
    }

    return new Response(JSON.stringify({
      success: true,
      processedUsers,
      errors: errors.length > 0 ? errors : undefined
    }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Fatal error during email fetching:', error)
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error during email fetching'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}) 