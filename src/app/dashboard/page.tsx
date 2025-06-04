import { redirect } from 'next/navigation'
import { createServerComponentClient } from '@/lib/supabase/server'
import { DashboardActions } from '@/components/dashboard/DashboardActions'

export default async function DashboardPage() {
  const supabase = createServerComponentClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
  }

  return (
    <main className="min-h-screen bg-ivory flex flex-col items-center py-8 px-4">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-bronze mb-2">
          HEIMDR
        </h1>
        <span className="text-steel-blue text-sm md:text-base">
          Din digitale vokter
        </span>
      </div>

      <DashboardActions />
    </main>
  )
} 