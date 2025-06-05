'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type AuthMode = 'login' | 'register'
type Status = 'idle' | 'loading' | 'success' | 'error'

interface FormData {
  email: string
  password: string
}

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: ''
  })
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push('/dashboard')
      }
    }
    checkUser()
  }, [router])

  const validateForm = () => {
    if (!formData.email || !formData.password) {
      setErrorMessage('Vennligst fyll ut alle felt')
      return false
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setErrorMessage('Vennligst skriv inn en gyldig e-postadresse')
      return false
    }

    if (formData.password.length < 6) {
      setErrorMessage('Passordet må være minst 6 tegn')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      setStatus('error')
      return
    }

    setStatus('loading')
    setErrorMessage('')

    try {
      if (mode === 'register') {
        const { error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`
          }
        })
        
        if (error) {
          console.error('Feil ved registrering:', error)
          throw error
        }
        
        setStatus('success')
        setErrorMessage('Bruker opprettet! Sjekk e-posten din for bekreftelse.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password
        })
        
        if (error) {
          console.error('Feil ved innlogging:', error)
          throw error
        }
        
        router.push('/dashboard')
      }
    } catch (error: any) {
      setStatus('error')
      setErrorMessage(
        mode === 'register'
          ? error.message || 'Kunne ikke opprette bruker. Prøv igjen senere.'
          : error.message || 'Feil e-post eller passord.'
      )
    }
  }

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login')
    setStatus('idle')
    setErrorMessage('')
  }

  const getStatusMessage = () => {
    switch (status) {
      case 'loading':
        return <p className="text-steel-blue">Behandler forespørsel...</p>
      case 'success':
        return <p className="text-success-green">{errorMessage}</p>
      case 'error':
        return <p className="text-muted-red">{errorMessage}</p>
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-bronze mb-2">
            Velkommen til HEIMDR
          </h1>
          <p className="text-charcoal text-lg">
            {mode === 'login' 
              ? 'Logg inn for å fortsette'
              : 'Opprett en konto for å komme i gang'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label 
                htmlFor="email" 
                className="block text-sm font-medium text-charcoal mb-2"
              >
                E-postadresse
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-charcoal focus:outline-none focus:ring-bronze focus:border-bronze focus:z-10 sm:text-sm"
                placeholder="din@epost.no"
              />
            </div>

            <div>
              <label 
                htmlFor="password" 
                className="block text-sm font-medium text-charcoal mb-2"
              >
                Passord
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  className="appearance-none rounded-lg relative block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-500 text-charcoal focus:outline-none focus:ring-bronze focus:border-bronze focus:z-10 sm:text-sm"
                  placeholder={mode === 'login' ? 'Ditt passord' : 'Velg et passord (minst 6 tegn)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-charcoal focus:outline-none focus:text-charcoal"
                  aria-label={showPassword ? 'Skjul passord' : 'Vis passord'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={status === 'loading'}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-bronze hover:bg-bronze/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bronze disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              {status === 'loading' 
                ? 'Behandler...' 
                : mode === 'login' 
                  ? 'Logg inn' 
                  : 'Opprett konto'}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-steel-blue hover:text-steel-blue/80 text-sm font-medium focus:outline-none"
            >
              {mode === 'login' 
                ? 'Ny bruker? Opprett konto her' 
                : 'Har du allerede en konto? Logg inn her'}
            </button>
          </div>

          <div className="text-center text-sm mt-4">
            {getStatusMessage()}
          </div>
        </form>
      </div>
    </div>
  )
} 