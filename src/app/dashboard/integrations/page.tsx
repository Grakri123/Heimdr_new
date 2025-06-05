import { DashboardActions } from '@/components/dashboard/DashboardActions'

export default function IntegrationsPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-bronze mb-2">
          HEIMDR
        </h1>
        <span className="text-steel-blue text-sm md:text-base">
          Din digitale vokter
        </span>
      </div>

      <DashboardActions />
    </div>
  )
} 