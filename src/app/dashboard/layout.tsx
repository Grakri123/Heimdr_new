import { DashboardLayout } from '@/components/layout/DashboardLayout'

interface LayoutProps {
  children: React.ReactNode
}

function Layout({ children }: LayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>
}

export default Layout 