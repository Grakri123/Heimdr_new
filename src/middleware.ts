import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Database } from '@/types/supabase'

export async function middleware(req: NextRequest) {
  // Skip middleware for static files and API routes that don't need auth
  if (
    req.nextUrl.pathname.startsWith('/_next') ||
    req.nextUrl.pathname.startsWith('/api/auth') ||
    req.nextUrl.pathname.startsWith('/login') ||
    req.nextUrl.pathname === '/'
  ) {
    return NextResponse.next()
  }

  const res = NextResponse.next()
  const supabase = createMiddlewareClient<Database>({ req, res })

  // Refresh session if expired - required for Server Components
  await supabase.auth.getSession()

  return res
}

// Update matcher to be more specific
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/:path*',
  ],
} 