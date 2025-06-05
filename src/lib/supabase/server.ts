import { createServerComponentClient, createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

// Cache the cookie store
let cookieStore: ReturnType<typeof cookies>

function getCookieStore() {
  if (!cookieStore) {
    cookieStore = cookies()
  }
  return cookieStore
}

export function createServerClient() {
  return createServerComponentClient<Database>({ 
    cookies: () => getCookieStore()
  })
}

export function createApiClient() {
  return createRouteHandlerClient<Database>({ 
    cookies: () => getCookieStore()
  })
} 