import { NextResponse } from 'next/server';
import resend from '@/lib/resend';
import { phishingAlertEmail } from '@/lib/emailTemplates';

function isValidEmail(email: string): boolean {
  // Enkel e-postvalidering
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, risk } = body;

    if (!email || !isValidEmail(email) || (risk !== 'high' && risk !== 'medium')) {
      console.log('Ugyldig input:', body);
      return NextResponse.json({ error: 'Ugyldig input' }, { status: 400 });
    }

    const { subject, html } = phishingAlertEmail(email, risk);

    const from = 'alerts@heimdr.no';
    const to = email;

    const result = await resend.emails.send({
      from,
      to,
      subject,
      html,
    });

    if (result.error) {
      console.error('Feil ved sending:', result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    console.log('Varsel sendt til', email, 'med risiko', risk);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Feil i send-alert:', error);
    return NextResponse.json({ error: 'Kunne ikke sende varsel' }, { status: 500 });
  }
} 