'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

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

  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`
        }
      })
      if (error) throw error
    } catch (error: any) {
      setStatus('error')
      setErrorMessage(error.message || 'Could not connect to Google')
    }
  }

  const handleMicrosoftLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          redirectTo: `${window.location.origin}/dashboard`
        }
      })
      if (error) throw error
    } catch (error: any) {
      setStatus('error')
      setErrorMessage(error.message || 'Could not connect to Microsoft')
    }
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setErrorMessage('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password
      })
      
      if (error) throw error
      router.push('/dashboard')
    } catch (error: any) {
      setStatus('error')
      setErrorMessage('Feil e-post eller passord.')
    }
  }

  return (
    <div className="min-h-screen bg-[#181818] flex">
      {/* Left Column - Login Section */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md bg-[#212121] p-8 rounded-lg">
          <div className="flex justify-center mb-8">
            {/* Replace with actual logo path once available */}
            <div className="w-32 h-32 relative">
              <Image
                src="/logo.svg"
                alt="HEIMDR"
                layout="fill"
                className="object-contain"
              />
            </div>
          </div>

          <div className="space-y-4">
            <button
              onClick={handleGoogleLogin}
              className="w-full bg-white text-gray-800 font-medium py-3 px-4 rounded flex items-center justify-center space-x-2 hover:bg-gray-100 transition-colors"
            >
              <span>GOOGLE</span>
            </button>

            <button
              onClick={handleMicrosoftLogin}
              className="w-full bg-white text-gray-800 font-medium py-3 px-4 rounded flex items-center justify-center space-x-2 hover:bg-gray-100 transition-colors"
            >
              <span>MICROSOFT</span>
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-[#212121] text-gray-400">eller</span>
              </div>
            </div>

            <form onSubmit={handleEmailLogin} className="space-y-4">
              <input
                type="email"
                placeholder="Epost adresse"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="w-full bg-[#181818] text-white px-4 py-3 rounded focus:outline-none focus:ring-2 focus:ring-[#b06f30]"
              />
              
              <input
                type="password"
                placeholder="Passord"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                className="w-full bg-[#181818] text-white px-4 py-3 rounded focus:outline-none focus:ring-2 focus:ring-[#b06f30]"
              />

              <div className="text-right">
                <a href="#" className="text-sm text-gray-400 hover:text-white">
                  Glemt passord?
                </a>
              </div>

              <button
                type="submit"
                className="w-full bg-[#b06f30] text-white font-medium py-3 px-4 rounded hover:bg-[#95602a] transition-colors"
              >
                Logg inn
              </button>
            </form>

            <button
              onClick={() => setMode('register')}
              className="w-full border border-[#b06f30] text-[#b06f30] font-medium py-3 px-4 rounded hover:bg-[#b06f30] hover:text-white transition-colors"
            >
              Registrer deg
            </button>
          </div>
        </div>
      </div>

      {/* Right Column - Testimonial Section */}
      <div className="hidden lg:flex w-1/2 bg-[#181818] flex-col items-center justify-center p-8">
        <div className="max-w-xl">
          <h2 className="text-2xl text-white font-medium mb-8 text-center">
            Hør hva våre brukere sier om oss
          </h2>

          <div className="bg-[#212121] p-8 rounded-lg mb-8">
            <p className="text-white text-lg mb-4">
              "For en enkel og trygg måte å holde inboxen sikker for angrep på"
            </p>
            <p className="text-[#b06f30]">-Fornøyd kunde</p>
          </div>

          <div className="flex justify-center space-x-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-[#b06f30]' : 'bg-[#b06f30]/30'}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
} 