'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/use-toast'

interface Email {
  id: string
  from_address: string
  subject: string
  date: string
  ai_risk_level: string
  ai_reason: string
}

interface EmailError {
  id: string
  error: string
}

export function EmailList() {
  const { toast } = useToast()
  const [emails, setEmails] = useState<Email[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analyzeEmails = async () => {
    try {
      setIsAnalyzing(true)
      const response = await fetch('/api/analyze-emails', {
        method: 'POST'
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze emails')
      }

      if (data.errors?.length > 0) {
        toast({
          title: 'Noen e-poster kunne ikke analyseres',
          description: `${data.errors.length} e-post(er) ble ikke analysert.`,
          variant: 'destructive'
        })
      }

      if (data.newAnalyzedEmails > 0) {
        toast({
          title: 'E-poster analysert',
          description: `${data.newAnalyzedEmails} nye e-post(er) ble analysert.`
        })
        await fetchEmails() // Refresh the email list
      } else {
        toast({
          title: 'Ingen nye e-poster',
          description: 'Alle e-poster er allerede analysert.'
        })
      }
    } catch (err) {
      console.error('Error analyzing emails:', err)
      toast({
        title: 'Feil ved analysering',
        description: err instanceof Error ? err.message : 'Kunne ikke analysere e-poster',
        variant: 'destructive'
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const fetchEmails = async () => {
    try {
      const response = await fetch('/api/gmail/fetch-emails')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch emails')
      }

      setEmails(data.emails)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch emails')
      toast({
        title: 'Feil ved henting av e-poster',
        description: err instanceof Error ? err.message : 'Kunne ikke hente e-poster',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchEmails()
  }, [])

  const getRiskLevelColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'høy':
        return 'bg-red-100 text-red-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      case 'lav':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bronze"></div>
        <p className="ml-3 text-steel-blue">Laster e-poster...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-charcoal">E-poster</h2>
        <button
          onClick={analyzeEmails}
          disabled={isAnalyzing}
          className="bg-bronze hover:bg-opacity-90 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAnalyzing ? (
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span className="ml-2">Analyserer...</span>
            </div>
          ) : (
            'Analyser nye e-poster'
          )}
        </button>
      </div>

      {error ? (
        <div className="text-center py-8">
          <p className="text-muted-red">{error}</p>
          <button
            onClick={fetchEmails}
            className="mt-4 text-bronze hover:text-opacity-80 transition-colors"
          >
            Prøv igjen
          </button>
        </div>
      ) : emails.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-400">Ingen e-poster funnet</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {emails.map((email) => (
            <div
              key={email.id}
              className="bg-[#181818] rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-medium text-white">{email.subject}</h3>
                  <p className="text-sm text-gray-400">{email.from_address}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-sm text-gray-400">
                    {new Date(email.date).toLocaleDateString('nb-NO', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full ${getRiskLevelColor(email.ai_risk_level)}`}>
                    {email.ai_risk_level}
                  </span>
                </div>
              </div>
              {email.ai_reason && (
                <p className="mt-2 text-sm text-gray-400 bg-[#212121] p-2 rounded">
                  {email.ai_reason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
} 