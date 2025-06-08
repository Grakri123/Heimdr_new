import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js'

const BATCH_SIZE = 100

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
            const gmailResponse = await fetch(
              `${Deno.env.get('NEXT_PUBLIC_APP_URL')}/api/gmail/fetch-emails`,
              {
                headers: {
                  'Authorization': `Bearer ${gmailTokens.data.access_token}`
                }
              }
            )
            if (!gmailResponse.ok) {
              errors.push({
                user_id: user.id,
                service: 'gmail',
                error: await gmailResponse.text()
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
            const outlookResponse = await fetch(
              `${Deno.env.get('NEXT_PUBLIC_APP_URL')}/api/outlook/fetch-emails`,
              {
                headers: {
                  'Authorization': `Bearer ${outlookTokens.data.access_token}`
                }
              }
            )
            if (!outlookResponse.ok) {
              errors.push({
                user_id: user.id,
                service: 'outlook',
                error: await outlookResponse.text()
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