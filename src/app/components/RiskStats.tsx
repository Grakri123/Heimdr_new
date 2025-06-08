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
          <h2 className="text-2xl font-semibold text-gray-800">Risikostatistikk</h2>
          <p className="text-sm text-gray-600 mt-1">
            Totalt analyserte e-poster: {totalAnalyzed}
          </p>
        </div>
        <Button 
          onClick={runAnalysis} 
          disabled={isAnalyzing}
          className="bg-bronze hover:bg-opacity-90 text-white"
        >
          {isAnalyzing ? (
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span className="ml-2">Analyserer...</span>
            </div>
          ) : (
            'Analyser nye e-poster'
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-red-100 text-red-800 p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 text-center">
          <p className="text-sm font-medium uppercase tracking-wide">Høy risiko</p>
          <p className="text-4xl font-bold mt-2">{highCount}</p>
          <div className="mt-2 text-sm">
            <p className="text-red-600 font-medium">{percentHigh}% av totalen</p>
            <p className="text-red-700">Krever umiddelbar oppmerksomhet</p>
          </div>
        </div>
        <div className="bg-yellow-100 text-yellow-800 p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 text-center">
          <p className="text-sm font-medium uppercase tracking-wide">Medium risiko</p>
          <p className="text-4xl font-bold mt-2">{mediumCount}</p>
          <div className="mt-2 text-sm">
            <p className="text-yellow-600 font-medium">{percentMedium}% av totalen</p>
            <p className="text-yellow-700">Bør undersøkes nærmere</p>
          </div>
        </div>
        <div className="bg-green-100 text-green-800 p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 text-center">
          <p className="text-sm font-medium uppercase tracking-wide">Lav risiko</p>
          <p className="text-4xl font-bold mt-2">{lowCount}</p>
          <div className="mt-2 text-sm">
            <p className="text-green-600 font-medium">{percentLow}% av totalen</p>
            <p className="text-green-700">Ingen umiddelbar risiko</p>
          </div>
        </div>
      </div>

      {emails.length > totalAnalyzed && (
        <div className="mt-4 text-center text-sm text-gray-600">
          Merk: {emails.length - totalAnalyzed} e-post(er) venter på analyse
        </div>
      )}
    </div>
  )
} 