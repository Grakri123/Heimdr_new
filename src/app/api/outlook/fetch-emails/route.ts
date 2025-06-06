import { createApiClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createApiClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('📧 Outlook: Sesjonsfeil:', sessionError)
      return NextResponse.json({ error: 'Session error' }, { status: 401 })
    }

    if (!session?.user) {
      console.log('📧 Outlook: Ingen bruker funnet')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('📧 Outlook: Bruker ID =', session.user.id)

    // Fetch Outlook token from Supabase
    const { data: tokenData, error: tokenError } = await supabase
      .from('outlook_tokens')
      .select('access_token')
      .eq('user_id', session.user.id)
      .single()

    if (tokenError || !tokenData) {
      console.log('📧 Outlook: Ingen token funnet')
      return NextResponse.json(
        { error: 'Outlook token not found' },
        { status: 404 }
      )
    }

    console.log('📧 Outlook: access_token =', tokenData.access_token.substring(0, 10) + '... (trunkert)')

    // Fetch emails from Microsoft Graph API
    const response = await fetch('https://graph.microsoft.com/v1.0/me/messages?$top=25&$select=id,subject,from,receivedDateTime,bodyPreview', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      }
    })

    console.log('📧 Outlook: Status =', response.status)
    
    const data = await response.json()

    if (!response.ok) {
      console.error('📧 Outlook: API-feil =', JSON.stringify(data, null, 2))
      return NextResponse.json(
        { error: 'Failed to fetch emails from Outlook' },
        { status: response.status }
      )
    }

    console.log('📧 Outlook: API-respons =', JSON.stringify(data, null, 2))
    
    if (!data.value || !Array.isArray(data.value)) {
      console.log('📧 Outlook: Ingen e-poster funnet')
      return NextResponse.json({ emails: [] })
    }

    // Get existing email IDs to avoid duplicates
    const { data: existingEmails, error: existingError } = await supabase
      .from('emails')
      .select('message_id')
      .eq('user_id', session.user.id)
      .eq('source', 'outlook')

    if (existingError) {
      console.error('📧 Outlook: Feil ved henting av eksisterende e-poster:', existingError)
      throw existingError
    }

    const existingIds = new Set(existingEmails?.map(e => e.message_id) || [])
    const newEmails = []
    let skippedCount = 0

    // Process each email
    for (const message of data.value) {
      if (existingIds.has(message.id)) {
        skippedCount++
        continue
      }

      const emailData = {
        id: message.id,
        user_id: session.user.id,
        from_address: message.from.emailAddress.address,
        subject: message.subject,
        date: message.receivedDateTime,
        body: message.bodyPreview,
        source: 'outlook',
        message_id: message.id,
        created_at: new Date().toISOString()
      }

      // Store in database
      const { error: insertError } = await supabase
        .from('emails')
        .insert(emailData)

      if (insertError) {
        console.error('📧 Outlook: Feil ved lagring av e-post:', message.id, insertError)
        continue
      }

      console.log('📧 Outlook: Lagret ny e-post:', message.id)
      newEmails.push(emailData)
    }

    console.log(`📧 Outlook: Fant ${data.value.length} e-poster. ${newEmails.length} nye ble lagret. ${skippedCount} eksisterte fra før.`)

    return NextResponse.json({
      newEmails: newEmails.length,
      emails: newEmails
    })
  } catch (error) {
    console.error('📧 Outlook: Uventet feil:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 