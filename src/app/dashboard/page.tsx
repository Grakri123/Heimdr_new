'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import RiskStats from '@/app/components/RiskStats'
import { Toaster } from '@/components/ui/toaster'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [hasGmailTokens, setHasGmailTokens] = useState(false)
  const supabase = createClientComponentClient()

  const refreshData = () => {
    // This is a placeholder function that will be passed to RiskStats
    // It can be used to trigger additional refreshes if needed
  }

  useEffect(() => {
    const checkGmailTokens = async () => {
      try {
        // Check if user has Gmail tokens
        const { data: tokenData, error: tokenError } = await supabase
          .from('gmail_tokens')
          .select('access_token')
          .single()

        if (!tokenError && tokenData) {
          setHasGmailTokens(true)
        }
      } catch (error) {
        console.error('Error checking Gmail tokens:', error)
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
          <p className="text-gray-600">
            Du må koble til Gmail-kontoen din før du kan se og analysere e-poster.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8">
      <RiskStats onRefresh={refreshData} />
      <Toaster />
    </div>
  )
} 