'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/use-toast'

export function DashboardActions() {
  const router = useRouter()
  const { toast } = useToast()
  const [isGoogleConnected, setIsGoogleConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [userInfo, setUserInfo] = useState<{ fullName: string; email: string } | null>(null)

  const supabase = createClient()

  useEffect(() => {
    checkGoogleConnection()
  }, [])

  const checkGoogleConnection = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error) {
        console.error('Auth error:', error)
        toast({
          title: 'Autentiseringsfeil',
          description: 'Kunne ikke hente brukerinformasjon. Vennligst logg inn på nytt.',
          variant: 'destructive'
        })
        router.push('/login')
        return
      }
      
      if (!user) {
        router.push('/login')
        return
      }

      // Check if we have tokens stored
      const { data: tokenData, error: tokenError } = await supabase
        .from('gmail_tokens')
        .select('access_token')
        .eq('user_id', user.id)
        .maybeSingle()

      if (tokenError) {
        console.error('Token error:', tokenError)
        toast({
          title: 'Feil ved sjekk av Gmail-tilkobling',
          description: 'Kunne ikke verifisere Gmail-tilkoblingen. Prøv å koble til på nytt.',
          variant: 'destructive'
        })
        setIsGoogleConnected(false)
        setUserInfo(null)
        return
      }

      const isConnected = !!tokenData
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
      toast({
        title: 'Uventet feil',
        description: 'Det oppstod en feil ved sjekk av Gmail-tilkobling.',
        variant: 'destructive'
      })
      setUserInfo(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGmailConnect = async () => {
    try {
      setIsConnecting(true)
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback`,
          scopes: 'https://www.googleapis.com/auth/gmail.readonly',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      })
      
      if (error) {
        console.error('OAuth error:', error)
        toast({
          title: 'Tilkoblingsfeil',
          description: 'Kunne ikke koble til Gmail. Prøv igjen senere.',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Error connecting to Gmail:', error)
      toast({
        title: 'Uventet feil',
        description: 'Det oppstod en feil ved tilkobling til Gmail.',
        variant: 'destructive'
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const handleGmailDisconnect = async () => {
    try {
      // First remove the tokens
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError

      if (user) {
        const { error: deleteError } = await supabase
          .from('gmail_tokens')
          .delete()
          .eq('user_id', user.id)
        
        if (deleteError) throw deleteError
      }

      // Then sign out
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError
      
      toast({
        title: 'Logget ut',
        description: 'Du har blitt koblet fra Gmail.',
      })
      
      router.push('/login')
    } catch (error) {
      console.error('Error disconnecting from Gmail:', error)
      toast({
        title: 'Feil ved frakobling',
        description: 'Kunne ikke koble fra Gmail. Prøv igjen senere.',
        variant: 'destructive'
      })
    }
  }

  if (isLoading) {
    return (
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-6 mb-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bronze"></div>
          <p className="ml-3 text-steel-blue">Laster...</p>
        </div>
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
            disabled={isConnecting}
            className="w-full bg-bronze hover:bg-opacity-90 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span className="ml-3">Kobler til...</span>
              </div>
            ) : (
              'Koble til Gmail'
            )}
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