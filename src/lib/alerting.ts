// Out-of-band security alerting. Posts a compact message to a configured webhook
// (Slack and Discord both accept these JSON keys) so anomalies reach a human
// out-of-band from the app. No-ops with a log line when SECURITY_ALERT_WEBHOOK_URL
// is unset, so it is safe in every environment. Never throws.
export async function sendSecurityAlert(title: string, detail: string): Promise<void> {
  const line = `🔐 CareerRai security — ${title}: ${detail}`;
  const url = process.env.SECURITY_ALERT_WEBHOOK_URL;
  if (!url) {
    console.warn('[security-alert]', line);
    return;
  }
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `text` → Slack incoming webhooks; `content` → Discord; harmless extra key
      // for endpoints that ignore it.
      body: JSON.stringify({ text: line, content: line }),
    });
  } catch (err) {
    console.error('[security-alert] post failed:', (err as Error)?.message, '|', line);
  }
}
