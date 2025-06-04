'use client'

import { useEffect, useState } from 'react'

export default function EnvDebugPage() {
  const [envVars, setEnvVars] = useState({
    NEXT_PUBLIC_SUPABASE_URL: '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ''
  })

  useEffect(() => {
    setEnvVars({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'Not set',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'Not set'
    })
  }, [])

  return (
    <div className="min-h-screen bg-ivory p-8">
      <h1 className="text-2xl font-bold text-bronze mb-6">Environment Variables Debug</h1>
      
      <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
        <h2 className="text-xl text-charcoal mb-4">Supabase Configuration</h2>
        
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-steel-blue">NEXT_PUBLIC_SUPABASE_URL</h3>
            <pre className="mt-1 p-2 bg-gray-100 rounded text-charcoal overflow-auto">
              {envVars.NEXT_PUBLIC_SUPABASE_URL}
            </pre>
          </div>

          <div>
            <h3 className="text-sm font-medium text-steel-blue">NEXT_PUBLIC_SUPABASE_ANON_KEY</h3>
            <pre className="mt-1 p-2 bg-gray-100 rounded text-charcoal overflow-auto">
              {envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY}
            </pre>
          </div>
        </div>

        <div className="mt-6 text-sm text-charcoal">
          <p>⚠️ Note: These values are only visible because they are NEXT_PUBLIC_ variables.</p>
          <p>Regular environment variables would not be accessible on the client side.</p>
        </div>
      </div>
    </div>
  )
} 