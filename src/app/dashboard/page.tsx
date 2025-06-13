'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import RiskStats from '@/app/components/RiskStats'
import EmailList from '@/app/components/EmailList'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/toaster'
import type { Email } from '@/types/email'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [emails, setEmails] = useState<Email[]>([])
  const [hasGmailTokens, setHasGmailTokens] = useState(false)
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
    const checkGmailTokens = async () => {
      try {
        // Get current user first
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        
        if (userError || !user) {
          console.error('Error getting user:', userError)
          return
        }

        // Check if user has Gmail tokens
        const { data: tokenData, error: tokenError } = await supabase
          .from('gmail_tokens')
          .select('access_token')
          .eq('user_id', user.id)
          .single()

        if (!tokenError && tokenData) {
          setHasGmailTokens(true)
          await refreshData()
        } else {
          console.log('No Gmail tokens found for user:', user.id)
          setHasGmailTokens(false)
        }
      } catch (error) {
        console.error('Error checking Gmail tokens:', error)
        setHasGmailTokens(false)
      } finally {
        setLoading(false)
      }
    }

    checkGmailTokens()
  }, [supabase])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Laster...</div>
      </div>
    )
  }

  if (!hasGmailTokens) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-4">Gmail ikke tilkoblet</h2>
          <p className="text-gray-600 mb-6">
            Du må koble til Gmail-kontoen din før du kan se og analysere e-poster.
          </p>
          <Button 
            onClick={() => window.location.href = '/dashboard/integrations'}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Koble til Gmail
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <RiskStats onRefresh={refreshData} />
      <EmailList emails={emails} onRefresh={refreshData} />
      <Toaster />
    </div>
  )
} 