// Diagnostic: send a real test proposal through the live sendProposal() path.
// Usage:  node test-email.mjs you@example.com
// Run locally (needs SENDGRID_API_KEY + FROM_EMAIL in .env), or on Railway:
//   railway run node test-email.mjs you@example.com
// Build first so ./dist exists:  npm run build
import 'dotenv/config';
import { sendProposal } from './dist/email.js';

const to = process.argv[2];
if (!to) {
  console.error('Usage: node test-email.mjs you@example.com');
  process.exit(1);
}

console.log(`Sending test proposal to ${to} (from ${process.env.FROM_EMAIL || 'ian@thunderboltsalessystems.com'})...`);
const ok = await sendProposal({
  email: to,
  firstName: 'Test',
  niche: 'Roofing',
  avgJobValue: 12000,
});
console.log(ok
  ? '✓ sendProposal returned true — check the inbox (and spam).'
  : '✗ sendProposal returned false — see the SendGrid error logged above.');
process.exit(ok ? 0 : 1);
