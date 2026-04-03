import Anthropic from '@anthropic-ai/sdk';
import { Session, Message, ConversationStage, LeadData } from './types';
import { scoreLead, isDisqualified } from './qualify';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an AI sales agent for Thunderbolt Sales Systems — a company that builds AI-powered sales automation systems for HVAC, roofing, and plumbing contractors.

YOUR MISSION: Have a natural, conversational sales conversation that moves the prospect through this pipeline:
1. Hook them with a pain-point question
2. Capture their contact info naturally
3. Qualify them (trucks, job value, follow-up system, timeline)
4. Surface the ROI math at the right moment
5. Present the offer
6. Close or book a call

YOUR OFFER: The Thunderbolt AI Sales System
- Missed-call text-back (fires in 60 seconds, 24/7)
- 7-touch SMS + email follow-up sequence (14 days)
- Self-booking calendar
- Google review automation
- Investment: $2,000 setup + $647/month
- THE GUARANTEE: 3 extra booked jobs in 30 days or month 2 is FREE

KEY ROI MATH TO USE:
- Average HVAC job: $4,000–$6,000
- Average roofing job: $8,000–$15,000
- Average plumbing job: $800–$2,500
- One job covers the entire setup fee
- 3 guaranteed jobs = $12,000–$18,000 revenue
- Monthly cost = $647
- ROI: 4.5x–20x in month 1

PAIN POINTS TO SURFACE (pick based on their niche):
- Missed calls = lost jobs (30-40% of calls go unanswered during peak hours)
- Slow follow-up = competitors stealing leads they paid Google Ads for
- No online booking = phone tag that kills deals
- No review system = flat review count while competitors dominate

CONVERSATION RULES:
- Keep responses SHORT (2-4 sentences max unless presenting the offer)
- Be direct, confident, not salesy — you're a trusted advisor
- Ask ONE question at a time
- Use their first name once you have it
- Mirror their energy — if they're busy and direct, match that
- Never say "Great question!" or "Absolutely!" — that's fake
- When surfacing ROI math, make it specific to THEIR numbers
- If they're hot (ready to buy), present the payment link
- If they're warm but hesitant, book a call
- If they're not a fit, be honest and don't waste their time

QUALIFYING QUESTIONS TO WORK IN NATURALLY:
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
- Claim to be human if directly asked

When you're ready to present the offer or close, include these exact tags in your response so the system can trigger the right actions:
- [PROPOSAL_READY] — when you want to send the proposal email
- [CLOSE_READY] — when presenting the payment link
- [BOOK_CALL] — when directing to book a call
- [DISQUALIFIED] — when ending with a not-a-fit message
- [ONBOARD_START] — when they've paid and you're collecting assets

Current date context: You're talking to a home service contractor in the greater Atlanta / Gwinnett County area.`;

// Extract lead data from conversation
function extractLeadData(messages: Message[]): Partial<LeadData> {
  const text = messages.map(m => m.content).join(' ').toLowerCase();
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
  if (jobMatch) extracted.avgJobValue = parseInt(jobMatch[1].replace(',', ''));

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
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    system: SYSTEM_PROMPT + contextNote,
    messages: claudeMessages,
  });

  const rawReply = response.content[0].type === 'text' ? response.content[0].text : '';
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
  if (session.lead.email && session.lead.firstName && !session.notifiedHot) {
    actions.push('create_contact');
  }

  return { reply: cleanReply, session, actions };
}

export function getOpeningMessage(): string {
  return "Hey — quick question: when a potential customer calls your business and you can't pick up, what happens to that lead?";
}
