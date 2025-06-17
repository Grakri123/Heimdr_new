import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import type { Email } from '@/types/email'
import { createClient } from '@/lib/supabase/client'

interface RiskStatsProps {
  onRefresh: () => void
}

export default function RiskStats({ onRefresh }: RiskStatsProps) {
  const [emails, setEmails] = useState<Email[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  const fetchEmails = async () => {
    try {
      const { data, error } = await supabase
        .from('emails')
        .select('*')
        .not('analyzed_at', 'is', null)

      if (error) {
        throw error
      }

      setEmails(data || [])
    } catch (error) {
      console.error('Error fetching emails:', error)
      toast({
        title: 'Feil ved henting av e-poster',
        description: 'Kunne ikke hente e-poststatistikk.',
        variant: 'destructive',
      })
    }
  }

  // Set up real-time subscription
  useEffect(() => {
    fetchEmails()

    // Subscribe to changes in the emails table
    const subscription = supabase
      .channel('emails-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for all changes (insert, update, delete)
          schema: 'public',
          table: 'emails',
        },
        async (payload) => {
          console.log('Database change detected:', payload)
          // Refresh data when changes occur
          await fetchEmails()
          onRefresh()
        }
      )
      .subscribe()

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const runAnalysis = async () => {
    try {
      setIsAnalyzing(true)
      
      const toastId = toast({
        title: 'Analyserer e-poster...',
        description: 'Vi henter inn nye e-poster fra Gmail og Outlook.',
        variant: 'default'
      })

      // Fetch emails in parallel
      const [gmailRes, outlookRes] = await Promise.all([
        fetch('/api/gmail/fetch-emails'),
        fetch('/api/outlook/fetch-emails')
      ])

      const gmailJson = await gmailRes.json()
      const outlookJson = await outlookRes.json()

      // Calculate total new emails
      const totalNew = (gmailJson?.newEmails || 0) + (outlookJson?.newEmails || 0)

      if (totalNew > 0) {
        // Now run the analysis on the new emails
        const response = await fetch('/api/analyze-emails', {
          method: 'POST',
        })
        
        if (!response.ok) {
          throw new Error('Failed to analyze emails')
        }
        
        const data = await response.json()
        
        toast({
          title: 'Analyse fullført',
          description: `${totalNew} nye e-poster hentet og analysert.`,
          variant: 'default'
        })
      } else {
        toast({
          title: 'Ingen nye e-poster',
          description: 'Ingen nye e-poster å analysere.',
          variant: 'default'
        })
      }
    } catch (error) {
      console.error('Error during analysis:', error)
      toast({
        title: 'Feil under analyse',
        description: 'Det oppstod en feil under analyse av e-poster.',
        variant: 'destructive',
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Count emails by risk level
  const highCount = emails.filter(email => email.ai_risk_level === 'Høy').length
  const mediumCount = emails.filter(email => email.ai_risk_level === 'Medium').length
  const lowCount = emails.filter(email => email.ai_risk_level === 'Lav').length
  const totalAnalyzed = highCount + mediumCount + lowCount
  const percentHigh = totalAnalyzed > 0 ? Math.round((highCount / totalAnalyzed) * 100) : 0
  const percentMedium = totalAnalyzed > 0 ? Math.round((mediumCount / totalAnalyzed) * 100) : 0
  const percentLow = totalAnalyzed > 0 ? Math.round((lowCount / totalAnalyzed) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-white">Risikostatistikk</h2>
          <p className="text-sm text-gray-400 mt-1">
            Totalt analyserte e-poster: {totalAnalyzed}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#181818] p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-red-400">Høy risiko</p>
          <p className="text-4xl font-bold mt-2 text-red-500">{highCount}</p>
          <div className="mt-2 text-sm">
            <p className="text-red-400 font-medium">{percentHigh}% av totalen</p>
            <p className="text-red-300">Krever umiddelbar oppmerksomhet</p>
          </div>
        </div>
        <div className="bg-[#181818] p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-yellow-400">Medium risiko</p>
          <p className="text-4xl font-bold mt-2 text-yellow-500">{mediumCount}</p>
          <div className="mt-2 text-sm">
            <p className="text-yellow-400 font-medium">{percentMedium}% av totalen</p>
            <p className="text-yellow-300">Bør undersøkes nærmere</p>
          </div>
        </div>
        <div className="bg-[#181818] p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-green-400">Lav risiko</p>
          <p className="text-4xl font-bold mt-2 text-green-500">{lowCount}</p>
          <div className="mt-2 text-sm">
            <p className="text-green-400 font-medium">{percentLow}% av totalen</p>
            <p className="text-green-300">Ingen umiddelbar risiko</p>
          </div>
        </div>
      </div>

      {emails.length > totalAnalyzed && (
        <div className="mt-4 text-center text-sm text-gray-400">
          Merk: {emails.length - totalAnalyzed} e-post(er) venter på analyse
        </div>
      )}
    </div>
  )
} 