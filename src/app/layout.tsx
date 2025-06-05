import './globals.css'
import type { Metadata } from 'next'
import { ReactNode } from 'react'
import { Inter } from 'next/font/google'
import { Toaster } from '@/components/ui/toaster'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'HEIMDR - Din digitale vokter',
  description: 'Sikker innlogging til HEIMDR-plattformen',
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="no" className="h-full">
      <body className={inter.className}>
        {children}
        <Toaster />
      </body>
    </html>
  )
} 