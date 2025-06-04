export default function Loading() {
  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-bronze mx-auto mb-4"></div>
        <p className="text-charcoal">Laster...</p>
      </div>
    </div>
  )
} 