"use client";
import { useRouter } from 'next/navigation'

export default function ConnectPage() {
  const router = useRouter()

  // Handler for tilkobling
  const handleConnect = (provider: 'gmail' | 'outlook') => {
    if (provider === 'gmail') {
      window.location.href = '/api/auth/gmail/login'
    } else {
      window.location.href = '/api/auth/outlook/login'
    }
  }

  // Handler for å lukke popup (gå tilbake til dashboard)
  const handleClose = () => {
    window.close();
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#232323] to-[#181818]">
      <button onClick={handleClose} className="absolute top-4 right-4 text-3xl text-gray-400 hover:text-white">&times;</button>
      <h2 className="text-2xl md:text-3xl font-semibold text-white mb-8 text-center">Koble til en bruker du ønsker å beskytte</h2>
      <div className="flex flex-col items-center w-full gap-8">
        <div className="flex flex-col items-center w-full">
          <span className="text-white text-lg mb-2">Koble til</span>
          <button
            onClick={() => handleConnect('gmail')}
            className="bg-white rounded-lg shadow-md px-8 py-4 flex items-center justify-center w-full max-w-xs hover:scale-105 transition-transform mb-4"
          >
            <img src="/Google.png" alt="Google" className="h-10 w-auto" />
          </button>
        </div>
        <span className="text-white text-lg">eller</span>
        <div className="flex flex-col items-center w-full">
          <span className="text-white text-lg mb-2">Koble til</span>
          <button
            onClick={() => handleConnect('outlook')}
            className="bg-white rounded-lg shadow-md px-8 py-4 flex items-center justify-center w-full max-w-xs hover:scale-105 transition-transform"
          >
            <img src="/Microsoft.png" alt="Microsoft" className="h-10 w-auto" />
          </button>
        </div>
      </div>
    </div>
  )
} 