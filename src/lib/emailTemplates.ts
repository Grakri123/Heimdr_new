export function phishingAlertEmail(email: string, risk: 'high' | 'medium', subject: string, from_address: string) {
  const riskText = risk === 'high' ? 'HØY' : 'MODERAT';
  const subjectLine = '🚨 Phishing-risiko oppdaget i e-post';
  const html = `
    <div style="font-family: Arial, sans-serif;">
      <h2>🚨 Advarsel: Phishing-risiko oppdaget</h2>
      <p>Det er oppdaget <strong>${riskText}</strong> risiko for phishing i e-posten:</p>
      <p><strong>Til:</strong> ${email}</p>
      <p><strong>Fra:</strong> ${from_address}</p>
      <p><strong>Emne:</strong> ${subject}</p>
      <p>Vennligst vær ekstra oppmerksom og ikke klikk på mistenkelige lenker eller vedlegg.</p>
      <hr />
      <small>Denne meldingen er sendt automatisk fra Heimdr.</small>
    </div>
  `;
  return { subject: subjectLine, html };
} 