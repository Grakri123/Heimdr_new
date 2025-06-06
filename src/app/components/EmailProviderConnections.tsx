import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Button } from '@/components/ui/button'

interface EmailConnection {
  access_token: string
  email?: string
}

export default function EmailProviderConnections() {
  const [hasGmailTokens, setHasGmailTokens] = useState(false)
  const [hasOutlookTokens, setHasOutlookTokens] = useState(false)
  const [gmailEmail, setGmailEmail] = useState<string>('')
  const [outlookEmail, setOutlookEmail] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const supabase = createClientComponentClient()

  const handleDisconnect = async (provider: 'gmail' | 'outlook') => {
    try {
      const table = `${provider}_tokens`
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)

      if (error) throw error

      if (provider === 'gmail') {
        setHasGmailTokens(false)
        setGmailEmail('')
      } else {
        setHasOutlookTokens(false)
        setOutlookEmail('')
      }
    } catch (error) {
      console.error(`Error disconnecting ${provider}:`, error)
    }
  }

  useEffect(() => {
    const checkConnections = async () => {
      try {
        // Check Gmail tokens
        const { data: gmailData } = await supabase
          .from('gmail_tokens')
          .select('access_token, email')
          .single()
        setHasGmailTokens(!!gmailData)
        if (gmailData?.email) {
          setGmailEmail(gmailData.email)
        }

        // Check Outlook tokens
        const { data: outlookData } = await supabase
          .from('outlook_tokens')
          .select('access_token, email')
          .single()
        setHasOutlookTokens(!!outlookData)
        if (outlookData?.email) {
          setOutlookEmail(outlookData.email)
        }
      } catch (error) {
        console.error('Error checking connections:', error)
      } finally {
        setLoading(false)
      }
    }

    checkConnections()
  }, [supabase])

  if (loading) {
    return <div className="text-gray-600">Laster tilkoblinger...</div>
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-800">E-posttilkoblinger</h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Gmail Connection */}
        <div className="p-4 border rounded-lg bg-white">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-800">Gmail</h4>
                <p className="text-sm text-gray-600">
                  {hasGmailTokens ? (
                    <>
                      <span className="text-green-600">Tilkoblet</span>
                      {gmailEmail && (
                        <span className="block text-gray-500">{gmailEmail}</span>
                      )}
                    </>
                  ) : (
                    'Ikke tilkoblet'
                  )}
                </p>
              </div>
              {hasGmailTokens ? (
                <Button
                  onClick={() => handleDisconnect('gmail')}
                  variant="outline"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Koble fra
                </Button>
              ) : (
                <Button
                  onClick={() => window.location.href = '/api/auth/gmail/login'}
                  variant="outline"
                >
                  Koble til Gmail
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Outlook Connection */}
        <div className="p-4 border rounded-lg bg-white">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-800">Outlook</h4>
                <p className="text-sm text-gray-600">
                  {hasOutlookTokens ? (
                    <>
                      <span className="text-green-600">Tilkoblet</span>
                      {outlookEmail && (
                        <span className="block text-gray-500">{outlookEmail}</span>
                      )}
                    </>
                  ) : (
                    'Ikke tilkoblet'
                  )}
                </p>
              </div>
              {hasOutlookTokens ? (
                <Button
                  onClick={() => handleDisconnect('outlook')}
                  variant="outline"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Koble fra
                </Button>
              ) : (
                <Button
                  onClick={() => window.location.href = '/api/auth/outlook/login'}
                  variant="outline"
                >
                  Koble til Outlook
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 