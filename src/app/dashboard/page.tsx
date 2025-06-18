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
import { CheckCircle, PlusCircle, Mail } from 'lucide-react'

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
      <UserConnectionsGrid />
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

function UserConnectionsGrid() {
  const [connections, setConnections] = useState<{
    provider: 'gmail' | 'outlook',
    email: string
    id: string
  }[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()

  // Hent alle tokens for brukeren
  const fetchConnections = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: gmails }, { data: outlooks }] = await Promise.all([
        supabase.from('gmail_tokens').select('id, email').eq('user_id', user.id),
        supabase.from('outlook_tokens').select('id, email').eq('user_id', user.id),
      ])
      const newConnections: { provider: 'gmail' | 'outlook', email: string, id: string }[] = []
      if (Array.isArray(gmails)) {
        for (const g of gmails) {
          if (g.email) newConnections.push({ provider: 'gmail', email: g.email, id: g.id })
        }
      }
      if (Array.isArray(outlooks)) {
        for (const o of outlooks) {
          if (o.email) newConnections.push({ provider: 'outlook', email: o.email, id: o.id })
        }
      }
      setConnections(newConnections)
    } catch (e) {
      toast({ title: 'Feil', description: 'Kunne ikke hente tilkoblinger', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConnections()
  }, [])

  // Handler for å åpne tilkoblingsside
  const handleConnectPage = () => {
    router.push('/dashboard/connect')
  }

  // Handler for å koble fra en konto
  const handleDisconnect = async (provider: 'gmail' | 'outlook', id: string) => {
    setDisconnectingId(id)
    try {
      const table = provider === 'gmail' ? 'gmail_tokens' : 'outlook_tokens'
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
      toast({ title: 'Koblet fra', description: 'Kontoen er koblet fra.', variant: 'default' })
      await fetchConnections()
    } catch (e) {
      toast({ title: 'Feil', description: 'Kunne ikke koble fra konto.', variant: 'destructive' })
    } finally {
      setDisconnectingId(null)
    }
  }

  // Grid med 3 kolonner per rad, dynamisk antall rader
  const gridItems = [...connections.map((conn) => ({ type: 'user', ...conn })), { type: 'add' }]
  const rows = []
  for (let i = 0; i < gridItems.length; i += 3) {
    rows.push(gridItems.slice(i, i + 3))
  }

  return (
    <>
      <div className="flex flex-col gap-6 max-w-4xl mx-auto mb-8">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {row.map((item, idx) => {
              if (item.type === 'user') {
                return (
                  <div key={item.id} className="bg-white rounded-lg shadow-lg p-6 flex flex-col items-center justify-center border-2 border-green-400">
                    <CheckCircle className="text-green-500 mb-2" size={32} />
                    <Mail className="text-gray-500 mb-1" size={20} />
                    <span className="font-semibold text-gray-800 mb-1">{item.email}</span>
                    <span className="text-xs text-green-600 font-medium mb-4">Tilkoblet ({item.provider === 'gmail' ? 'Google' : 'Microsoft'})</span>
                    <Button
                      onClick={() => handleDisconnect(item.provider, item.id)}
                      className="w-full bg-muted-red hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg mt-2"
                      disabled={disconnectingId === item.id}
                    >
                      {disconnectingId === item.id ? 'Kobler fra...' : 'Koble fra'}
                    </Button>
                  </div>
                )
              } else if (item.type === 'add') {
                return (
                  <button
                    key="add-user"
                    className="bg-[#181818] hover:bg-[#232323] text-white rounded-lg shadow-lg p-6 flex flex-col items-center justify-center border-2 border-dashed border-bronze transition-colors"
                    onClick={handleConnectPage}
                  >
                    <PlusCircle className="text-bronze mb-2" size={32} />
                    <span className="font-semibold">Koble til ny bruker</span>
                  </button>
                )
              } else {
                return null
              }
            })}
          </div>
        ))}
      </div>
    </>
  )
} 