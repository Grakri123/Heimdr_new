'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function DashboardActions() {
  const router = useRouter()
  const [isGoogleConnected, setIsGoogleConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [userInfo, setUserInfo] = useState<{ fullName: string; email: string } | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    checkGoogleConnection()
  }, [])

  const checkGoogleConnection = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error) throw error
      
      if (!user) {
        router.push('/login')
        return
      }

      const isConnected = user?.identities?.some(i => i.provider === 'google')
      setIsGoogleConnected(isConnected)

      if (isConnected && user) {
        setUserInfo({
          fullName: user.user_metadata.full_name || 'Ukjent navn',
          email: user.email || 'Ingen e-post tilgjengelig'
        })
      } else {
        setUserInfo(null)
      }
    } catch (error) {
      console.error('Error checking Google connection:', error)
      setUserInfo(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGmailConnect = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`
        }
      })
      if (error) throw error
    } catch (error) {
      console.error('Error connecting to Gmail:', error)
    }
  }

  const handleGmailDisconnect = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      router.push('/login')
    } catch (error) {
      console.error('Error disconnecting from Gmail:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-6 mb-8">
        <p className="text-steel-blue text-center">Laster...</p>
      </div>
    )
  }

  return (
    <>
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-6 mb-8">
        <h2 className="text-2xl font-semibold text-charcoal mb-4">
          GMAIL
        </h2>
        <p className="text-steel-blue mb-6">
          Status: {isGoogleConnected ? 'Tilkoblet' : 'Ikke tilkoblet'}
        </p>

        {isGoogleConnected && userInfo && (
          <div className="mb-6 p-4 bg-ivory rounded-lg border border-steel-blue border-opacity-20">
            <p className="text-charcoal text-sm mb-2">Innlogget som:</p>
            <p className="text-charcoal font-medium">{userInfo.fullName}</p>
            <p className="text-steel-blue text-sm">{userInfo.email}</p>
          </div>
        )}

        {!isGoogleConnected ? (
          <button
            onClick={handleGmailConnect}
            className="w-full bg-bronze hover:bg-opacity-90 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Koble til Gmail
          </button>
        ) : (
          <button
            onClick={handleGmailDisconnect}
            className="w-full bg-muted-red hover:bg-opacity-90 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Koble fra Gmail
          </button>
        )}
      </div>

      {isGoogleConnected && (
        <button
          onClick={handleGmailDisconnect}
          className="text-steel-blue hover:text-charcoal font-medium py-2 px-4 rounded-lg transition-colors"
        >
          Logg ut
        </button>
      )}
    </>
  )
} 