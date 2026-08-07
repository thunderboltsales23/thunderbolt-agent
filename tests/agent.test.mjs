// Thunderbolt Agent — offer & conversion-path tests.
//
// Run: npm test   (builds first, then runs this file)
//
// These drive the REAL server from ./dist over HTTP, with only the Anthropic
// SDK stubbed out, so they need no API key and cost nothing. The model's
// reply is scripted per-turn, which lets us assert on the parts we own: tag
// handling, stage transitions, lead extraction, and the CTA the widget gets.
//
// Deliberately NOT tested here: the model's own wording (that it quotes $297,
// names N.B.O., and never proposes a call). That lives in the system
// prompt and can only be verified against the live API — see README.
//
// If you change the offer or the close, update EXPECTED_PAYMENT_LINK and the
// assertions in "the close" below.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const Module = require('module');
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED_PAYMENT_LINK =
  'https://link.fastpaydirect.com/payment-link/6a7009397b99151a54041dad';
const PORT = 3999;
const BASE = `http://localhost:${PORT}`;

// ── Stub the Anthropic SDK before the server pulls it in ──────────────────
let scriptedReply = '';
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === '@anthropic-ai/sdk') return '__anthropic_stub__';
  return origResolve.call(this, request, ...rest);
};
class AnthropicStub {
  constructor() {
    this.messages = {
      create: async () => ({ content: [{ type: 'text', text: scriptedReply }] }),
    };
  }
}
AnthropicStub.default = AnthropicStub;
require.cache['__anthropic_stub__'] = {
  id: '__anthropic_stub__',
  filename: '__anthropic_stub__',
  loaded: true,
  exports: AnthropicStub,
};

// Env the server reads at import time. Cleared so the tests assert on the
// in-code defaults rather than whatever happens to be in a local .env.
process.env.PORT = String(PORT);
delete process.env.PAYMENT_LINK;
delete process.env.BOOKING_URL;
delete process.env.GHL_WEBHOOK_URL; // keep the suite from firing real webhooks

let server;
try {
  server = require(path.join(REPO, 'dist', 'server.js'));
} catch (err) {
  console.error('Could not load ./dist — run `npm run build` first.\n', err.message);
  process.exit(1);
}

// ── Tiny assertion helpers ───────────────────────────────────────────────
let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? `\n      got: ${detail}` : ''}`);
  }
}
function group(name) {
  console.log(`\n${name}`);
}

async function startSession() {
  const r = await fetch(`${BASE}/session/start`, { method: 'POST' });
  return (await r.json()).sessionId;
}
async function say(id, message, reply) {
  scriptedReply = reply;
  const r = await fetch(`${BASE}/session/${id}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return r.json();
}
async function getSession(id) {
  return (await fetch(`${BASE}/session/${id}`)).json();
}

// ── Tests ────────────────────────────────────────────────────────────────
async function run() {
  group('the close: [CLOSE_READY] serves the payment link');
  {
    const id = await startSession();
    const res = await say(
      id,
      'yes lets do it',
      "Here's the link to get started — $297/month, no setup fee. [CLOSE_READY]"
    );
    check('CTA type is payment', res.cta?.type === 'payment', JSON.stringify(res.cta));
    check('CTA points at the payment link', res.cta?.url === EXPECTED_PAYMENT_LINK, res.cta?.url);
    check('CTA label names the offer and price',
      /N\.B\.O\..*297/.test(res.cta?.label || ''), res.cta?.label);
    check('CTA label mentions no setup fee',
      !/setup fee/i.test(res.cta?.label || ''), res.cta?.label);
    check('stage advances to close', res.stage === 'close', res.stage);
    check('control tag is stripped from the reply',
      !res.message.includes('[CLOSE_READY]'), res.message);
  }

  group('qualifying conversation captures the lead and closes on payment');
  {
    const id = await startSession();
    await say(id, "I'm Dave, they go to voicemail", 'What trade are you in?');
    await say(id, 'HVAC, 4 trucks, we serve Marietta and north Atlanta.', "What's your average job?");
    await say(id, 'average job runs about $5,000, need this fixed right now', 'Best email and phone?');
    const res = await say(
      id,
      'dave@coolairhvac.com, 770-555-0142',
      "Dave, here's your link — $297/month, cancel anytime. [CLOSE_READY]"
    );
    check('closes on payment, not booking', res.cta?.type === 'payment', JSON.stringify(res.cta));

    const s = await getSession(id);
    check('first name captured', s.lead.firstName === 'Dave', s.lead.firstName);
    check('trade captured', s.lead.niche === 'HVAC', s.lead.niche);
    check('service area captured', /marietta/i.test(s.lead.serviceArea || ''), s.lead.serviceArea);
    check('email captured', s.lead.email === 'dave@coolairhvac.com', s.lead.email);
    check('phone captured as 10 digits', s.lead.phone === '7705550142', s.lead.phone);
    check('team size captured', s.lead.truckCount === 4, String(s.lead.truckCount));
    // Regression: "average job runs about $5,000" has 16 chars of filler
    // between the job word and the figure, which the old {0,15} gap missed.
    check('job value captured through filler words',
      s.lead.avgJobValue === 5000, String(s.lead.avgJobValue));
    check('timeline captured', s.lead.timeline === 'now', s.lead.timeline);
    check('lead scores hot', s.score.total >= 7, `score ${s.score.total}`);
  }

  group('booking is a fallback, not the default');
  {
    const id = await startSession();
    const res = await say(
      id,
      'can I talk to an actual person first?',
      'Of course — grab a time here. [BOOK_CALL]'
    );
    check('CTA type is booking', res.cta?.type === 'booking', JSON.stringify(res.cta));
    check('booking URL is populated, not "#"',
      (res.cta?.url || '').includes('leadconnectorhq'), res.cta?.url);
    check('stage is booked', res.stage === 'booked', res.stage);
  }

  group('retired proposal flow is gone');
  {
    const id = await startSession();
    const res = await say(id, 'send me info', 'Here is the info. [PROPOSAL_READY]');
    check('no proposal stage exists', res.stage !== 'proposal', res.stage);
    check('no proposal CTA is emitted', !res.cta, JSON.stringify(res.cta));
    check('retired tag never leaks to the user',
      !res.message.includes('[PROPOSAL_READY]'), res.message);
  }

  group('unknown control tags never reach the user');
  {
    const id = await startSession();
    const res = await say(id, 'hi', 'Sure thing. [SOME_NEW_TAG] Anything else?');
    check('hallucinated tag is stripped', !/\[SOME_NEW_TAG\]/.test(res.message), res.message);
    check('surrounding text survives intact',
      /Sure thing\. Anything else\?/.test(res.message), res.message);
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const total = pass + failures.length;
  console.log(`\n${'─'.repeat(60)}`);
  if (failures.length === 0) {
    console.log(`✓ all ${total} assertions passed`);
  } else {
    console.log(`✗ ${failures.length} of ${total} failed:`);
    for (const f of failures) console.log(`    - ${f}`);
  }
  console.log('');
  process.exit(failures.length === 0 ? 0 : 1);
}

// Give the listener a moment to bind before firing requests.
setTimeout(() => {
  run().catch(err => {
    console.error('\nTest run crashed:', err);
    process.exit(1);
  });
}, 600);
