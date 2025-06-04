// src/app/env-debug/page.tsx
export default function EnvDebug() {
    return (
      <div style={{ padding: 40 }}>
        <p>URL: {process.env.NEXT_PUBLIC_SUPABASE_URL ?? '❌ MISSING'}</p>
        <p>KEY: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '❌ MISSING'}</p>
      </div>
    )
  }
  