'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import RiskStats from '@/app/components/RiskStats'
import EmailList from '@/app/components/EmailList'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/toaster'
import type { Email } from '@/types/email'
import { AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'
import { createClient } from '@/lib/supabase/client'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [emails, setEmails] = useState<Email[]>([])
  const [hasGmailTokens, setHasGmailTokens] = useState(false)
  const [hasOutlookTokens, setHasOutlookTokens] = useState(false)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const supabase = createClientComponentClient()

  const refreshData = async () => {
    try {
      const { data: emailData, error: emailError } = await supabase
        .from('emails')
        .select('*')
        .order('date', { ascending: false })
        .limit(50)

      if (emailError) {
        console.error('Error fetching emails:', emailError)
        return
      }

      setEmails(emailData || [])
    } catch (error) {
      console.error('Error in refreshData:', error)
    }
  }

  useEffect(() => {
    const checkConnections = async () => {
      try {
        // Get current user first
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        
        console.log('Current user:', user?.id)
        setDebugInfo(prev => ({ ...prev, user }))
        
        if (userError || !user) {
          console.error('Error getting user:', userError)
          setDebugInfo(prev => ({ ...prev, userError }))
          return
        }

        // Check Gmail tokens
        const { data: gmailData, error: gmailError } = await supabase
          .from('gmail_tokens')
          .select('access_token')
          .eq('user_id', user.id)
          .single()

        console.log('Token check result:', { gmailData, gmailError })
        setDebugInfo(prev => ({ ...prev, gmailData, gmailError }))

        if (!gmailError && gmailData?.access_token) {
          console.log('Found valid token for user')
          setHasGmailTokens(true)
        } else {
          console.log('No valid Gmail tokens found for user:', user.id)
          setHasGmailTokens(false)
        }

        // Check Outlook tokens
        const { data: outlookData, error: outlookError } = await supabase
          .from('outlook_tokens')
          .select('access_token')
          .eq('user_id', user.id)
          .single()

        console.log('Token check result:', { outlookData, outlookError })
        setDebugInfo(prev => ({ ...prev, outlookData, outlookError }))

        if (!outlookError && outlookData?.access_token) {
          console.log('Found valid token for user')
          setHasOutlookTokens(true)
        } else {
          console.log('No valid Outlook tokens found for user:', user.id)
          setHasOutlookTokens(false)
        }

        // Always load existing emails
        await refreshData()
      } catch (error) {
        console.error('Error checking connections:', error)
        setDebugInfo(prev => ({ ...prev, error }))
        setHasGmailTokens(false)
        setHasOutlookTokens(false)
      } finally {
        setLoading(false)
      }
    }

    checkConnections()
  }, [supabase])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Laster...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <RiskStats onRefresh={refreshData} />
      <ConnectionBoxes />
      <EmailList emails={emails} onRefresh={refreshData} />
      <Toaster />
      {process.env.NODE_ENV === 'development' && debugInfo && (
        <pre className="mt-8 text-left text-xs bg-gray-100 p-4 rounded">
          Debug info:
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
      )}
    </div>
  )
}

function ConnectionBoxes() {
  const router = useRouter()
  const { toast } = useToast()
  const [isGoogleConnected, setIsGoogleConnected] = useState(false)
  const [isOutlookConnected, setIsOutlookConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [userInfo, setUserInfo] = useState<{ fullName: string; email: string } | null>(null)
  const [outlookEmail, setOutlookEmail] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    checkConnections()
  }, [])

  const checkConnections = async () => {
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
      // Check Gmail tokens
      const { data: gmailTokenData, error: gmailTokenError } = await supabase
        .from('gmail_tokens')
        .select('access_token, email')
        .eq('user_id', user.id)
        .maybeSingle()
      if (gmailTokenError) {
        console.error('Gmail token error:', gmailTokenError)
        toast({
          title: 'Feil ved sjekk av Gmail-tilkobling',
          description: 'Kunne ikke verifisere Gmail-tilkoblingen. Prøv å koble til på nytt.',
          variant: 'destructive'
        })
        setIsGoogleConnected(false)
        setUserInfo(null)
      } else {
        const isGmailConnected = !!gmailTokenData
        setIsGoogleConnected(isGmailConnected)
        if (isGmailConnected) {
          setUserInfo({
            fullName: 'Ukjent navn',
            email: gmailTokenData.email || 'Ingen e-post tilgjengelig'
          })
        } else {
          setUserInfo(null)
        }
      }
      // Check Outlook tokens
      const { data: outlookTokenData, error: outlookTokenError } = await supabase
        .from('outlook_tokens')
        .select('access_token, email')
        .eq('user_id', user.id)
        .maybeSingle()
      if (outlookTokenError) {
        console.error('Outlook token error:', outlookTokenError)
        toast({
          title: 'Feil ved sjekk av Outlook-tilkobling',
          description: 'Kunne ikke verifisere Outlook-tilkoblingen. Prøv å koble til på nytt.',
          variant: 'destructive'
        })
        setIsOutlookConnected(false)
        setOutlookEmail(null)
      } else {
        setIsOutlookConnected(!!outlookTokenData)
        setOutlookEmail(outlookTokenData?.email || null)
      }
    } catch (error) {
      console.error('Error checking connections:', error)
      toast({
        title: 'Uventet feil',
        description: 'Det oppstod en feil ved sjekk av tilkoblinger.',
        variant: 'destructive'
      })
      setUserInfo(null)
      setOutlookEmail(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGmailConnect = () => {
    window.location.href = '/api/auth/gmail/login'
  }

  const handleGmailDisconnect = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (user) {
        const { error: deleteError } = await supabase
          .from('gmail_tokens')
          .delete()
          .eq('user_id', user.id)
        if (deleteError) throw deleteError
      }
      toast({
        title: 'Frakoblet',
        description: 'Du har blitt koblet fra Gmail.',
      })
      setIsGoogleConnected(false)
      setUserInfo(null)
    } catch (error) {
      console.error('Error disconnecting from Gmail:', error)
      toast({
        title: 'Feil ved frakobling',
        description: 'Kunne ikke koble fra Gmail. Prøv igjen senere.',
        variant: 'destructive'
      })
    }
  }

  const handleOutlookConnect = () => {
    window.location.href = '/api/auth/outlook/login'
  }

  const handleOutlookDisconnect = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (user) {
        const { error: deleteError } = await supabase
          .from('outlook_tokens')
          .delete()
          .eq('user_id', user.id)
        if (deleteError) throw deleteError
      }
      toast({
        title: 'Frakoblet',
        description: 'Du har blitt koblet fra Outlook.',
      })
      setIsOutlookConnected(false)
    } catch (error) {
      console.error('Error disconnecting from Outlook:', error)
      toast({
        title: 'Feil ved frakobling',
        description: 'Kunne ikke koble fra Outlook. Prøv igjen senere.',
        variant: 'destructive'
      })
    }
  }

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl bg-white rounded-lg shadow-lg p-6 mb-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bronze"></div>
          <p className="ml-3 text-steel-blue">Laster...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
      {/* Gmail Box */}
      <div className="w-full bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-semibold text-charcoal mb-4">GMAIL</h2>
        <p className="text-steel-blue mb-6">Status: {isGoogleConnected ? 'Tilkoblet' : 'Ikke tilkoblet'}</p>
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
      {/* Outlook Box */}
      <div className="w-full bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-semibold text-charcoal mb-4">OUTLOOK</h2>
        <p className="text-steel-blue mb-6">Status: {isOutlookConnected ? 'Tilkoblet' : 'Ikke tilkoblet'}</p>
        {isOutlookConnected && outlookEmail && (
          <div className="mb-6 p-4 bg-ivory rounded-lg border border-steel-blue border-opacity-20">
            <p className="text-charcoal text-sm mb-2">Innlogget som:</p>
            <p className="text-steel-blue text-sm">{outlookEmail}</p>
          </div>
        )}
        {!isOutlookConnected ? (
          <button
            onClick={handleOutlookConnect}
            className="w-full bg-bronze hover:bg-opacity-90 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Koble til Outlook
          </button>
        ) : (
          <button
            onClick={handleOutlookDisconnect}
            className="w-full bg-muted-red hover:bg-opacity-90 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Koble fra Outlook
          </button>
        )}
      </div>
    </div>
  )
} 