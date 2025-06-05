import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import type { Email } from '@/types/email'

interface EmailListProps {
  emails: Email[]
  onRefresh: () => void
}

export default function EmailList({ emails, onRefresh }: EmailListProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const { toast } = useToast()

  const runAnalysis = async () => {
    try {
      setIsAnalyzing(true)
      const response = await fetch('/api/analyze-emails', {
        method: 'POST',
      })
      
      if (!response.ok) {
        throw new Error('Failed to analyze emails')
      }
      
      const data = await response.json()
      toast({
        title: 'AI-analyse fullført',
        description: `${data.newAnalyzedEmails} nye e-poster ble analysert.`,
      })
      
      onRefresh()
    } catch (error) {
      toast({
        title: 'Feil under analyse',
        description: 'Kunne ikke fullføre AI-analysen av e-poster.',
        variant: 'destructive',
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">E-poster</h2>
        <Button 
          onClick={runAnalysis} 
          disabled={isAnalyzing}
        >
          {isAnalyzing ? 'Kjører AI-analyse...' : 'Analyser nye e-poster'}
        </Button>
      </div>

      <div className="space-y-4">
        {emails.map((email) => (
          <div 
            key={email.id} 
            className="p-4 border rounded-lg space-y-2 hover:bg-gray-50"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">{email.subject}</p>
                <p className="text-sm text-gray-600">{email.from_address}</p>
                <p className="text-sm text-gray-500">
                  {new Date(email.date).toLocaleString('nb-NO')}
                </p>
              </div>
              {email.ai_risk_level ? (
                <div className={`px-3 py-1 rounded-full text-sm ${
                  email.ai_risk_level === 'Høy' 
                    ? 'bg-red-100 text-red-800' 
                    : email.ai_risk_level === 'Medium'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-green-100 text-green-800'
                }`}>
                  Risiko: {email.ai_risk_level}
                </div>
              ) : (
                <div className="px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-600">
                  Ikke analysert
                </div>
              )}
            </div>

            {email.ai_reason ? (
              <p className="text-sm text-gray-600 italic">{email.ai_reason}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">
                Denne e-posten har ikke blitt analysert enda. Klikk på "Analyser nye e-poster" for å starte analysen.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
} 