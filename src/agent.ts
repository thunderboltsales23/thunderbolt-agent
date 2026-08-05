import Anthropic from '@anthropic-ai/sdk';
import { Session, Message, ConversationStage, LeadData } from './types';
import { scoreLead, isDisqualified } from './qualify';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// The payment link IS the close. Booking is only a fallback for prospects who
// explicitly ask to talk to a human first.
export const PAYMENT_LINK = process.env.PAYMENT_LINK
  || 'https://link.fastpaydirect.com/payment-link/6a7009397b99151a54041dad';
export const BOOKING_URL = process.env.BOOKING_URL
  || 'https://api.leadconnectorhq.com/widget/booking/LYPtWjY6i3ezhZR1HICB';

const SYSTEM_PROMPT = `You are Bolt — an AI sales agent for Thunderbolt Sales Systems, a company that builds AI-powered sales automation systems for home service contractors: HVAC, Roofing, Plumbing, and Electrical.

YOUR MISSION: Have a natural, conversational sales conversation that moves the prospect through this pipeline:
1. Hook them with a pain-point question
2. Find out what type of contractor they are (HVAC, Roofing, Plumbing, or Electrical)
3. Learn their business name and the service area they cover
4. Capture their contact info naturally — email AND phone
5. Surface the ROI math specific to their niche
6. Present the offer
7. Close by sending the payment link

YOUR OFFER — THE M.I.M.O.E.:
There is ONE offer. There are no tiers, no packages to choose between, and no upsells.

The M.I.M.O.E. — $297/month. No setup fee. No contracts.

What's included:
- Managed Meta Ads campaigns (we build, run, and optimize them for you)
- A professional website
- A 24/7 AI appointment setter
- Automated review generation

- 30-day satisfaction guarantee
- Limited to 10 contractors per market — once a market is full, it's closed

THE CLOSE — THIS IS THE GOAL: Once the prospect is qualified and shows interest, send them the
payment link so they can start today. That is how the conversation is supposed to end.
The payment link is: ${PAYMENT_LINK}
Say something like "Here's the link to get started — it's $297/month, no setup fee, and you can
cancel anytime." Then include the [CLOSE_READY] tag.

DO NOT offer to book a call, schedule a demo, or set up a strategy session as the next step.
That is NOT the close anymore. The payment link is the close.
The ONLY exception: if the prospect specifically asks to speak to a human or get on a call
before buying, that's fine — accommodate them with this link: ${BOOKING_URL} and tag [BOOK_CALL].
Never suggest a call on your own initiative.

KEY ROI MATH BY NICHE (use THEIR niche when surfacing numbers — $297/month is the only cost):
- HVAC: Average job $4,000–$6,000 | One job covers more than a year of the system
- Roofing: Average job $8,000–$15,000 | One job covers 2+ years of the system
- Plumbing: Average job $800–$2,500 | One job covers 3–8 months of the system
- Electrical: Average job $500–$3,000 | One job covers 2–10 months of the system
- There is no setup fee and no contract, so there is nothing to recoup up front — month one
  pays for itself with a single booked job in most trades

PAIN POINTS TO SURFACE (pick based on their niche):
- Missed calls = lost jobs (30-40% of calls go unanswered during peak hours)
- Slow follow-up = competitors stealing leads they paid for
- No online booking = phone tag that kills deals
- No review system = flat review count while competitors dominate
- Running ads with no system behind them = paying for leads that go nowhere
- For Electrical: emergency calls going to voicemail = lost high-ticket jobs
- For Roofing: storm season follow-up chaos = leaving money on the table

CONVERSATION RULES:
- Keep responses SHORT (2-4 sentences max unless presenting the offer)
- Be direct, confident, not salesy — you're a trusted advisor
- Ask ONE question at a time
- Early in the conversation, naturally ask what type of contractor they are if not clear
- Use their first name once you have it
- Mirror their energy — if they're busy and direct, match that
- Never say "Great question!" or "Absolutely!" — that's fake
- When surfacing ROI math, make it specific to THEIR niche and numbers
- If they ask about price at any point, answer straight: $297/month, no setup fee, no contract
- Once they're qualified and interested, send the payment link — don't stall, don't add steps

QUALIFYING QUESTIONS TO WORK IN NATURALLY:
- What type of work do you do — HVAC, roofing, plumbing, electrical?
- What's the name of your business?
- What area do you cover / where do you run your jobs?
- What's the best email to reach you at?
- What's a good phone number for you?
- How many trucks / technicians on your team?
- What's your average job value?
- Right now when you miss a call, what happens?
- What's your timeline — are you looking to fix this now or just exploring?

STAGE TRANSITIONS:
- After you have name + business name: you're in qualify stage
- After you have their trade, service area, email, and phone: present the offer
- After the offer lands: send the payment link and close

NEVER:
- Mention Quick Strike, Booked Solid, or Domination — those offers are retired and no longer sold
- Quote any price other than $297/month
- Mention a setup fee, onboarding fee, or contract — there are none
- Offer tiers, packages, or "levels" to choose from
- Make up what M.I.M.O.E. stands for — if asked, say it's Thunderbolt's complete growth system
  and walk them through what's included
- Make up specific numbers you don't know
- Promise things not in the offer
- Be pushy or high-pressure
- Ask for credit card info yourself — send the payment link and let them pay securely there
- Claim to be human if directly asked

When you're ready to close, include these exact tags in your response so the system can trigger
the right actions:
- [CLOSE_READY] — when presenting the payment link (this is your default close)
- [BOOK_CALL] — ONLY when the prospect explicitly asked to talk to a human first
- [DISQUALIFIED] — when ending with a not-a-fit message
- [ONBOARD_START] — when they've paid and you're collecting assets

Current context: You're talking to a home service contractor in the greater Atlanta metro area.`;

// Pull a dollar job value out of free text, tied to job/ticket/average wording
// (in either order) so lead counts and phone digits aren't mistaken for it.
// Supports "$12,000", "$12k", and "12k a job".
function extractJobValue(text: string): number | undefined {
  const patterns = [
    /(?:average|avg|typical|per job|a job|\/job|job value|job is|jobs are|each job|ticket)[^.\d$]{0,15}\$?(\d[\d,]*)(k)?/,
    /\$?(\d[\d,]*)(k)?\s*(?:per job|a job|\/job|average|avg|job value|a ticket|ticket)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    let n = parseInt(m[1].replace(/,/g, ''), 10);
    if (isNaN(n)) continue;
    if (m[2]) n *= 1000;          // "12k" → 12000
    else if (n < 100) n *= 1000;  // bare "12" in a job context means $12k
    if (n >= 100) return n;
  }
  return undefined;
}

// Extract lead data from conversation
function extractLeadData(messages: Message[]): Partial<LeadData> {
  // Only read the prospect's own messages — never the agent's — so Bolt's
  // example figures and niche ranges don't get captured as the lead's data.
  const userText = messages.filter(m => m.role === 'user').map(m => m.content).join(' ');
  const text = userText.toLowerCase();
  const extracted: Partial<LeadData> = {};

  // Extract niche
  if (text.includes('hvac') || text.includes('air condition') || text.includes('heating') || text.includes('cooling')) {
    extracted.niche = 'HVAC';
  } else if (text.includes('roof')) {
    extracted.niche = 'Roofing';
  } else if (text.includes('plumb')) {
    extracted.niche = 'Plumbing';
  } else if (text.includes('electric')) {
    extracted.niche = 'Electrical';
  }

  // Extract truck/team size
  const truckMatch = text.match(/(\d+)\s*(truck|tech|van|employee|guy|crew)/);
  if (truckMatch) extracted.truckCount = parseInt(truckMatch[1]);

  // Extract average job value (only from the prospect's words, with job context)
  const jobValue = extractJobValue(text);
  if (jobValue !== undefined) extracted.avgJobValue = jobValue;

  // Extract email
  const emailMatch = userText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) extracted.email = emailMatch[0];

  // Extract US phone number
  const phoneMatch = userText.match(/(?:\+?1[-.\s]?)?\(?([2-9]\d{2})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/);
  if (phoneMatch) extracted.phone = `${phoneMatch[1]}${phoneMatch[2]}${phoneMatch[3]}`;

  // Extract service area from the phrasings prospects actually use ("we serve
  // Marietta", "based out of North Atlanta"). Stops at punctuation/conjunctions
  // so it captures the place name and not the rest of the sentence.
  const areaMatch = userText.match(
    /\b(?:we (?:serve|service|cover|work in|operate in)|i (?:serve|service|cover|work in)|based (?:in|out of)|service area is|located in|out of)\s+([A-Za-z][A-Za-z.\s-]{2,40}?)(?=[,.!?;]|\s+(?:and|but|we|i|our|area|mostly|so)\b|$)/i
  );
  if (areaMatch) extracted.serviceArea = areaMatch[1].trim();

  // Extract first name from intro phrases
  const nameMatch = userText.match(/\b(?:i'?m|i am|this is|my name is|name's|it's)\s+([A-Z][a-z]+)\b/i);
  if (nameMatch) extracted.firstName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase();

  // Extract timeline signals
  if (text.includes('right now') || text.includes('asap') || text.includes('immediately') || text.includes('ready to start')) {
    extracted.timeline = 'now';
  } else if (text.includes('next month') || text.includes('30 day') || text.includes('soon')) {
    extracted.timeline = '30days';
  } else if (text.includes('few months') || text.includes('not sure') || text.includes('just looking')) {
    extracted.timeline = 'just_looking';
  }

  return extracted;
}

// Determine stage from conversation context and agent response
function detectStageFromResponse(response: string, currentStage: ConversationStage): ConversationStage {
  if (response.includes('[DISQUALIFIED]')) return 'disqualified';
  if (response.includes('[ONBOARD_START]')) return 'onboard';
  if (response.includes('[CLOSE_READY]')) return 'close';
  if (response.includes('[BOOK_CALL]')) return 'booked';
  return currentStage;
}

// Strip control tags before the reply reaches the user. Matches any
// [ALL_CAPS_TAG] so a retired or hallucinated tag can never leak into the chat.
function cleanResponse(response: string): string {
  return response
    .replace(/\[[A-Z][A-Z0-9_]*\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export async function chat(session: Session, userMessage: string): Promise<{
  reply: string;
  session: Session;
  actions: string[];
}> {
  // Add user message to history
  session.messages.push({ role: 'user', content: userMessage });

  // Extract any new lead data from the conversation
  const extracted = extractLeadData(session.messages);
  session.lead = { ...session.lead, ...extracted };

  // Build messages for Claude
  const claudeMessages = session.messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // Add context injection based on current lead data
  let contextNote = '';
  if (session.lead.firstName && session.score.total > 0) {
    contextNote = `\n\n[INTERNAL CONTEXT — not visible to user: Lead score: ${session.score.total}/10. Stage: ${session.stage}. Data collected: ${JSON.stringify(session.lead)}]`;
  }

  // Get Claude response
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: SYSTEM_PROMPT + contextNote,
    messages: claudeMessages,
  });

  const rawReply = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const cleanReply = cleanResponse(rawReply);

  // Update session
  session.messages.push({ role: 'assistant', content: cleanReply });
  session.stage = detectStageFromResponse(rawReply, session.stage);
  session.score = scoreLead(session.lead, session.messages.length);
  session.updatedAt = new Date();

  // Determine actions to take
  const actions: string[] = [];

  if (rawReply.includes('[CLOSE_READY]')) {
    actions.push('show_payment_link');
    session.closeLinkSent = true;
  }

  if (rawReply.includes('[BOOK_CALL]')) {
    actions.push('show_booking');
  }

  if (session.score.hot && !session.notifiedHot && session.lead.phone) {
    actions.push('notify_hot');
    session.notifiedHot = true;
  }

  // Create GHL contact once we have email
  if (session.lead.email && session.lead.firstName && !session.contactCreated) {
    actions.push('create_contact');
    session.contactCreated = true;
  }

  return { reply: cleanReply, session, actions };
}

export function getOpeningMessage(): string {
  return "Hey — quick question: when a potential customer calls your business and you can't pick up, what happens to that lead?";
}
