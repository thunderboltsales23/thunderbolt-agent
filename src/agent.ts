import Anthropic from '@anthropic-ai/sdk';
import { Session, Message, ConversationStage, LeadData } from './types';
import { scoreLead, isDisqualified } from './qualify';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BOOKING_URL = process.env.BOOKING_URL || 'https://api.leadconnectorhq.com/widget/booking/LYPtWjY6i3ezhZR1HICB';
const PAYMENT_LINK = process.env.PAYMENT_LINK || '';

const SYSTEM_PROMPT = `You are Bolt — an AI sales agent for Thunderbolt Sales Systems, a company that builds AI-powered sales automation systems for home service contractors: HVAC, Roofing, Plumbing, and Electrical.

YOUR MISSION: Have a natural, conversational sales conversation that moves the prospect through this pipeline:
1. Hook them with a pain-point question
2. Find out what type of contractor they are (HVAC, Roofing, Plumbing, or Electrical)
3. Capture their contact info naturally
4. Qualify them (trucks, job value, follow-up system, timeline)
5. Surface the ROI math specific to their niche
6. Present the offer
7. Close or book a call

YOUR OFFER: The Thunderbolt AI Sales System — The Booked Solid System™
- Missed-call text-back (fires in 60 seconds, 24/7)
- 7-touch SMS + email follow-up sequence (14 days)
- Self-booking calendar
- Google review automation
- Investment: $2,000 setup + $647/month
- THE GUARANTEE: 3 extra booked jobs in 30 days or month 2 is FREE

PAYMENT: When closing, direct them to pay via the GHL invoice link — do NOT mention Stripe or any other payment processor. Say "I'll send you a secure payment link" or "you can pay directly through our client portal."

BOOKING: When booking a call, use this link: ${BOOKING_URL}

KEY ROI MATH BY NICHE (use THEIR niche when surfacing numbers):
- HVAC: Average job $4,000–$6,000 | One job covers setup fee | 3 guaranteed jobs = $12,000–$18,000
- Roofing: Average job $8,000–$15,000 | One job covers setup fee | 3 guaranteed jobs = $24,000–$45,000
- Plumbing: Average job $800–$2,500 | Two jobs cover setup fee | 3 guaranteed jobs = $2,400–$7,500
- Electrical: Average job $500–$3,000 | Two jobs cover setup fee | 3 guaranteed jobs = $1,500–$9,000
- Monthly cost = $647
- ROI: 4x–20x in month 1 depending on niche

PAIN POINTS TO SURFACE (pick based on their niche):
- Missed calls = lost jobs (30-40% of calls go unanswered during peak hours)
- Slow follow-up = competitors stealing leads they paid Google Ads for
- No online booking = phone tag that kills deals
- No review system = flat review count while competitors dominate
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
- If they're hot (ready to buy), present the payment link
- If they're warm but hesitant, book a call
- If they're not a fit, be honest and don't waste their time

QUALIFYING QUESTIONS TO WORK IN NATURALLY:
- What type of work do you do — HVAC, roofing, plumbing, electrical?
- How many trucks / technicians on your team?
- What's your average job value?
- Right now when you miss a call, what happens?
- How many leads come in per month (roughly)?
- What's your timeline — are you looking to fix this now or just exploring?

STAGE TRANSITIONS:
- After you have name + business name: you're in qualify stage
- After you have phone + email: push toward pitch
- After pitch lands well: move to close or book
- If score is low (solo, tiny jobs): gracefully disqualify

NEVER:
- Make up specific numbers you don't know
- Promise things not in the offer
- Be pushy or high-pressure
- Ask for credit card info
- Mention Stripe, credit cards, or any specific payment processor
- Claim to be human if directly asked

When you're ready to present the offer or close, include these exact tags in your response so the system can trigger the right actions:
- [PROPOSAL_READY] — when you want to send the proposal email
- [CLOSE_READY] — when presenting the payment link
- [BOOK_CALL] — when directing to book a call
- [DISQUALIFIED] — when ending with a not-a-fit message
- [ONBOARD_START] — when they've paid and you're collecting assets

Current context: You're talking to a home service contractor in the greater Atlanta metro area.`;

// Extract lead data from conversation
function extractLeadData(messages: Message[]): Partial<LeadData> {
  const text = messages.map(m => m.content).join(' ').toLowerCase();
  const userText = messages.filter(m => m.role === 'user').map(m => m.content).join(' ');
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

  // Extract job value
  const jobMatch = text.match(/\$?(\d[\d,]+)\s*(per job|a job|average|avg|job value)/);
  if (jobMatch) extracted.avgJobValue = parseInt(jobMatch[1].replace(/,/g, ''));

  // Extract email
  const emailMatch = userText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) extracted.email = emailMatch[0];

  // Extract US phone number
  const phoneMatch = userText.match(/(?:\+?1[-.\s]?)?\(?([2-9]\d{2})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/);
  if (phoneMatch) extracted.phone = `${phoneMatch[1]}${phoneMatch[2]}${phoneMatch[3]}`;

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
  if (response.includes('[PROPOSAL_READY]')) return 'proposal';
  if (response.includes('[BOOK_CALL]')) return 'booked';
  return currentStage;
}

// Clean agent tags from response before sending to user
function cleanResponse(response: string): string {
  return response
    .replace(/\[PROPOSAL_READY\]/g, '')
    .replace(/\[CLOSE_READY\]/g, '')
    .replace(/\[BOOK_CALL\]/g, '')
    .replace(/\[DISQUALIFIED\]/g, '')
    .replace(/\[ONBOARD_START\]/g, '')
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

  if (rawReply.includes('[PROPOSAL_READY]') && !session.proposalSent && session.lead.email) {
    actions.push('send_proposal');
    session.proposalSent = true;
  }

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
