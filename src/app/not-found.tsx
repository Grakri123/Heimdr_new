export default function NotFound() {
  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-bronze mb-4">404</h1>
        <h2 className="text-2xl text-charcoal mb-2">Side ikke funnet</h2>
        <p className="text-steel-blue mb-6">
          Beklager, men siden du leter etter finnes ikke.
        </p>
        <a
          href="/"
          className="inline-block px-6 py-2 bg-bronze text-white rounded-md hover:bg-bronze/90 transition-colors"
        >
          Gå til forsiden
        </a>
      </div>
    </div>
  )
} 