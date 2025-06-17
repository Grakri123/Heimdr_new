'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, Menu } from 'lucide-react'
import { useState } from 'react'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const navItems = [
    { href: '/dashboard', label: 'Forside' },
    { href: '/dashboard/integrations', label: 'Integrasjoner' },
    { href: '/dashboard/settings', label: 'Innstillinger' }
  ]

  return (
    <div className="min-h-screen bg-[#212121]">
      {/* Header */}
      <header className="bg-[#181818] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex-shrink-0">
              <h1 className="text-2xl font-bold text-bronze">
                HEIMDR
              </h1>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex space-x-8">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-sm font-medium transition-colors hover:text-bronze ${
                    pathname === item.href ? 'text-bronze' : 'text-gray-300'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Logout Button */}
            <div className="hidden md:flex">
              <form action="/logout">
                <button
                  type="submit"
                  className="flex items-center px-4 py-2 text-sm font-medium text-gray-300 hover:text-bronze transition-colors"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logg ut
                </button>
              </form>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="text-gray-300 hover:text-bronze"
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-[#181818] border-t border-gray-700">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-3 py-2 text-base font-medium transition-colors ${
                    pathname === item.href
                      ? 'text-bronze'
                      : 'text-gray-300 hover:text-bronze'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              <form action="/logout" className="block">
                <button
                  type="submit"
                  className="w-full flex items-center px-3 py-2 text-base font-medium text-gray-300 hover:text-bronze transition-colors"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logg ut
                </button>
              </form>
            </div>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
} 