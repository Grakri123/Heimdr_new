'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import RiskStats from '@/app/components/RiskStats'
import EmailList from '@/app/components/EmailList'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/toaster'
import type { Email } from '@/types/email'
import { AlertCircle } from 'lucide-react'

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