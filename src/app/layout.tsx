import './globals.css'
import type { Metadata } from 'next'
import { ReactNode } from 'react'

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
      <body className="h-full">{children}</body>
    </html>
  )
} 