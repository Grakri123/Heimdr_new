import { createApiClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createApiClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('Session error:', sessionError)
      return NextResponse.json({ error: 'Session error' }, { status: 401 })
    }

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch only analyzed emails from Supabase, sorted by date DESC
    const { data: emails, error: emailsError } = await supabase
      .from('emails')
      .select('*')
      .eq('user_id', session.user.id)
      .not('analyzed_at', 'is', null)  // Only get analyzed emails
      .not('ai_risk_level', 'is', null)  // Make sure they have a risk level
      .order('date', { ascending: false })

    if (emailsError) {
      console.error('Error fetching emails:', emailsError)
      return NextResponse.json(
        { error: 'Failed to fetch emails' },
        { status: 500 }
      )
    }

    return NextResponse.json({ emails: emails || [] })
  } catch (error) {
    console.error('Error in GET /api/emails:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 