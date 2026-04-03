import axios from 'axios';
import { LeadData } from './types';

export async function sendProposal(lead: LeadData): Promise<boolean> {
  if (!lead.email) return false;

  const apiKey = process.env.SMTP_PASS || '';
  const proposalUrl = process.env.PROPOSAL_PDF_URL || '';
  const bookingUrl = process.env.BOOKING_URL || '';
  const paymentLink = process.env.PAYMENT_LINK || '';
  const fromName = process.env.FROM_NAME || 'Ian | Thunderbolt Sales Systems';
  const fromEmail = process.env.FROM_EMAIL || 'ian@thunderboltsalessystems.com';

  const niche = lead.niche || 'home service';
  const firstName = lead.firstName || 'there';
  const jobValue = lead.avgJobValue ? `$${lead.avgJobValue.toLocaleString()}` : '$4,000+';

  // Niche-specific tier display
  const nicheLabel = niche.toLowerCase().includes('hvac') ? 'HVAC'
    : niche.toLowerCase().includes('plumb') ? 'Plumbing'
    : niche.toLowerCase().includes('roof') ? 'Roofing'
    : niche.toLowerCase().includes('electric') ? 'Electrical'
    : niche;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #0a0a0a; padding: 20px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: #000000; border-radius: 12px; overflow: hidden; border: 1px solid #1a1a1a;">

    <!-- HEADER -->
    <div style="background: #000000; padding: 28px 32px; text-align: center; border-bottom: 2px solid #00A19B;">
      <div style="margin-bottom: 12px;">
        <span style="font-size: 28px; font-weight: 900; color: #00A19B; letter-spacing: 2px;">⚡ THUNDERBOLT</span>
        <br>
        <span style="font-size: 13px; color: #C0C0C0; letter-spacing: 4px;">SALES SYSTEMS</span>
      </div>
      <h1 style="color: #ffffff; margin: 16px 0 0; font-size: 20px; font-weight: 700;">Your Proposal is Ready, ${firstName}</h1>
    </div>

    <!-- BODY -->
    <div style="padding: 32px; color: #e8e8e8;">

      <p style="font-size: 16px; color: #C0C0C0;">Based on our conversation, here is your custom proposal for the <strong style="color: #00A19B;">Thunderbolt AI Sales System</strong> — built specifically for <strong style="color: #ffffff;">${nicheLabel} contractors</strong>.</p>

      <!-- ROI MATH BOX -->
      <div style="background: #0d0d0d; border-left: 4px solid #00A19B; padding: 20px 24px; margin: 28px 0; border-radius: 4px;">
        <p style="margin: 0 0 8px; color: #00A19B; font-weight: bold; font-size: 15px;">The Math for Your Business:</p>
        <p style="margin: 0; color: #b8b8b8; line-height: 1.6;">
          One ${nicheLabel} job at ${jobValue} covers your entire setup fee.<br>
          We guarantee <strong style="color: #ffffff;">3 booked jobs in 30 days</strong> or month 2 is <strong style="color: #00A19B;">FREE</strong>.
        </p>
      </div>

      <!-- INVESTMENT -->
      <p style="font-size: 15px; color: #C0C0C0;">
        <strong style="color: #ffffff;">Investment:</strong> $2,000 setup + $647/month
        <span style="color: #888; font-size: 13px;">(cancel anytime)</span>
      </p>

      <!-- WHAT'S INCLUDED -->
      <div style="margin: 24px 0; padding: 20px 24px; background: #0d0d0d; border-radius: 8px; border: 1px solid #1a1a1a;">
        <p style="margin: 0 0 12px; color: #00A19B; font-weight: bold;">What's included for ${nicheLabel} contractors:</p>
        <ul style="margin: 0; padding-left: 20px; color: #b8b8b8; line-height: 2;">
          <li>AI voice dispatcher — answers every call 24/7</li>
          <li>Automated follow-up sequences (7-touch)</li>
          <li>Emergency triage + owner alerts</li>
          <li>Live calendar booking into GHL</li>
          <li>Full call transcripts + analytics</li>
        </ul>
      </div>

      <!-- CTA BUTTONS -->
      <div style="text-align: center; margin: 36px 0 24px;">
        <a href="${proposalUrl}" style="background: #00A19B; color: #ffffff; padding: 15px 36px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; margin-bottom: 14px; letter-spacing: 0.5px;">View Your Full Proposal →</a>
        <br>
        ${paymentLink ? `<a href="${paymentLink}" style="background: #E10600; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block; margin-bottom: 14px;">Pay Now & Get Started →</a><br>` : ''}
        <a href="${bookingUrl}" style="color: #00A19B; font-size: 13px; text-decoration: none;">or book a 15-min call to go over it</a>
      </div>

      <p style="color: #666; font-size: 13px; margin-top: 32px;">Questions? Reply to this email — I respond same day.</p>
      <p style="color: #C0C0C0;">— ${fromName}</p>

    </div>

    <!-- FOOTER -->
    <div style="background: #000000; padding: 16px 32px; text-align: center; border-top: 1px solid #1a1a1a;">
      <p style="color: #444; font-size: 11px; margin: 0; letter-spacing: 1px;">THUNDERBOLT SALES SYSTEMS · ATLANTA, GA · thunderboltsalessystems.com</p>
    </div>

  </div>
</body>
</html>`;

  try {
    await axios.post(
      'https://api.sendgrid.com/v3/mail/send',
      {
        personalizations: [{ to: [{ email: lead.email }] }],
        from: { email: fromEmail, name: fromName },
        subject: `${firstName}, your Thunderbolt ${nicheLabel} proposal + 3-job guarantee`,
        content: [{ type: 'text/html', value: html }],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`✓ Proposal sent via SendGrid to ${lead.email}`);
    return true;
  } catch (err: any) {
    const msg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('✗ SendGrid API error:', msg);
    return false;
  }
}
