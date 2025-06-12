import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

let supabaseClient: ReturnType<typeof createBrowserClient<Database>>

export const createClient = () => {
  if (!supabaseClient) {
    supabaseClient = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          flowType: 'pkce',
          detectSessionInUrl: true,
          persistSession: true,
        },
      }
    )
  }
  return supabaseClient
}

export const isSupabaseConfigured = () => true 