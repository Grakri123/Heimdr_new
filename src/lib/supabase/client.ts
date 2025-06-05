import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { Database } from '@/types/supabase'

// Cache the client instance
let supabaseClient: ReturnType<typeof createClientComponentClient<Database>>

export const createClient = () => {
  if (!supabaseClient) {
    supabaseClient = createClientComponentClient<Database>()
  }
  return supabaseClient
}

export const isSupabaseConfigured = () => true 