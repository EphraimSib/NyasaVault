import { config, isProd } from '../config.ts';

/**
 * Sends email through any provider that accepts a simple JSON webhook
 * (Resend/Brevo/SendGrid relay, Zapier, your own function): POST {to, subject, text}.
 * Without EMAIL_WEBHOOK_URL, dev prints to the console; production returns false so support can use the admin reset-link tool.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (config.emailWebhookUrl) {
    try {
      const r = await fetch(config.emailWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, subject, text }), signal: AbortSignal.timeout(8000) });
      return r.ok;
    } catch { return false; }
  }
  if (!isProd) { console.log(`[email → ${to}] ${subject}\n${text}\n`); return true; }
  return false;
}
