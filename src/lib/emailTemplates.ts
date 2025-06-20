export function phishingAlertEmail(email: string, risk: 'high' | 'medium') {
  const riskText = risk === 'high' ? 'HØY' : 'MODERAT';
  const subject = '🚨 Phishing-risiko oppdaget i e-post';
  const html = `
    <div style="font-family: Arial, sans-serif;">
      <h2>🚨 Advarsel: Phishing-risiko oppdaget</h2>
      <p>Det er oppdaget <strong>${riskText}</strong> risiko for phishing i e-posten:</p>
      <p><strong>${email}</strong></p>
      <p>Vennligst vær ekstra oppmerksom og ikke klikk på mistenkelige lenker eller vedlegg.</p>
      <hr />
      <small>Denne meldingen er sendt automatisk fra Heimdr.</small>
    </div>
  `;
  return { subject, html };
} 