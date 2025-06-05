'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname()

  const navItems = [
    { href: '/dashboard', label: 'Forside', icon: '🏠' },
    { href: '/dashboard/integrations', label: 'Integrasjoner', icon: '🔗' },
    { href: '/dashboard/settings', label: 'Innstillinger', icon: '⚙️' }
  ]

  return (
    <div className="min-h-screen bg-ivory flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-md flex flex-col justify-between">
        {/* Top section with logo and navigation */}
        <div>
          <h1 className="text-2xl font-bold text-bronze text-center border-b py-6">
            HEIMDR
          </h1>
          
          <nav className="py-6">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-6 py-3 text-charcoal hover:bg-bronze/5 transition-colors ${
                  pathname === item.href ? 'bg-bronze/10 font-semibold' : ''
                }`}
              >
                <span className="mr-3 text-lg">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Logout button at bottom */}
        <form 
          action="/logout" 
          className="border-t p-4"
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center px-6 py-3 text-muted-red hover:bg-muted-red/5 transition-colors rounded-lg"
          >
            <LogOut className="w-5 h-5 mr-2" />
            Logg ut
          </button>
        </form>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-y-auto">
        {children}
      </main>
    </div>
  )
} 