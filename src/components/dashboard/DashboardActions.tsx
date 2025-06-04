'use client'

import { createBrowserClient } from '@supabase/ssr'

interface DashboardActionsProps {
  isConnected?: boolean
}

export function DashboardActions({ isConnected = false }: DashboardActionsProps) {
  const handleGmailConnect = async () => {
    // TODO: Implement Gmail connection
    console.log('Connecting to Gmail...')
  }

  const handleLogout = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <>
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-6 mb-8">
        <h2 className="text-2xl font-semibold text-charcoal mb-4">
          GMAIL
        </h2>
        <p className="text-steel-blue mb-6">
          Status: {isConnected ? 'Tilkoblet' : 'Ikke tilkoblet'}
        </p>
        <button
          onClick={handleGmailConnect}
          className="w-full bg-bronze hover:bg-opacity-90 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          Koble til Gmail
        </button>
      </div>

      <button
        onClick={handleLogout}
        className="text-steel-blue hover:text-charcoal font-medium py-2 px-4 rounded-lg transition-colors"
      >
        Logg ut
      </button>
    </>
  )
} 