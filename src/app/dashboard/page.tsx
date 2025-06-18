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
  }[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    const fetchConnections = async () => {
      setLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const [{ data: gmail }, { data: outlook }] = await Promise.all([
          supabase.from('gmail_tokens').select('email').eq('user_id', user.id).maybeSingle(),
          supabase.from('outlook_tokens').select('email').eq('user_id', user.id).maybeSingle(),
        ])
        const newConnections = []
        if (gmail && gmail.email) newConnections.push({ provider: 'gmail', email: gmail.email })
        if (outlook && outlook.email) newConnections.push({ provider: 'outlook', email: outlook.email })
        setConnections(newConnections)
      } catch (e) {
        toast({ title: 'Feil', description: 'Kunne ikke hente tilkoblinger', variant: 'destructive' })
      } finally {
        setLoading(false)
      }
    }
    fetchConnections()
  }, [])

  // Handler for å åpne OAuth
  const handleConnect = (provider: 'gmail' | 'outlook') => {
    if (provider === 'gmail') {
      window.location.href = '/api/auth/gmail/login'
    } else {
      window.location.href = '/api/auth/outlook/login'
    }
  }

  // Enkel modal-komponent
  function Modal({ open, onClose, children }: { open: boolean, onClose: () => void, children: React.ReactNode }) {
    if (!open) return null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full relative">
          <button onClick={onClose} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-xl">&times;</button>
          {children}
        </div>
      </div>
    )
  }

  // Render grid
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-8">
        {/* Vis tilkoblede brukere */}
        {connections.map((conn, idx) => (
          <div key={conn.provider} className="bg-white rounded-lg shadow-lg p-6 flex flex-col items-center justify-center border-2 border-green-400">
            <CheckCircle className="text-green-500 mb-2" size={32} />
            <Mail className="text-gray-500 mb-1" size={20} />
            <span className="font-semibold text-gray-800 mb-1">{conn.email}</span>
            <span className="text-xs text-green-600 font-medium">Tilkoblet ({conn.provider === 'gmail' ? 'Google' : 'Microsoft'})</span>
          </div>
        ))}
        {/* Alltid én boks for 'Koble til ny bruker' hvis det er plass */}
        {connections.length < 3 && (
          <button
            className="bg-[#181818] hover:bg-[#232323] text-white rounded-lg shadow-lg p-6 flex flex-col items-center justify-center border-2 border-dashed border-bronze transition-colors"
            onClick={() => setModalOpen(true)}
          >
            <PlusCircle className="text-bronze mb-2" size={32} />
            <span className="font-semibold">Koble til ny bruker</span>
          </button>
        )}
        {/* Fyll ut grid med tomme bokser hvis mindre enn 3 */}
        {Array.from({ length: 3 - (connections.length + 1) }).map((_, idx) => (
          <div key={"empty-" + idx} className="bg-gray-100 rounded-lg p-6 border-2 border-dashed border-gray-300 flex items-center justify-center opacity-50">
            <span className="text-gray-400">Tom plass</span>
          </div>
        ))}
      </div>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="mb-4">
          <h2 className="text-xl font-semibold mb-2">Koble til ny bruker</h2>
          <p className="text-gray-600 text-sm mb-4">Velg hvilken type konto du vil koble til:</p>
          <div className="flex flex-col gap-4">
            <Button onClick={() => handleConnect('gmail')} className="w-full bg-bronze text-white hover:bg-bronze/90 flex items-center gap-2">
              <img src="/google.svg" alt="Google" className="h-5 w-5" /> Koble til Google
            </Button>
            <Button onClick={() => handleConnect('outlook')} className="w-full bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2">
              <img src="/microsoft.svg" alt="Microsoft" className="h-5 w-5" /> Koble til Microsoft
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
} 