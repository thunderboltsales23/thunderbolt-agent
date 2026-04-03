// ── THUNDERBOLT AGENT — TYPES ────────────────────────────────────────────

export type ConversationStage =
  | 'hook'          // Opening pain-point question
  | 'capture'       // Collecting name, business, phone, email
  | 'qualify'       // Scoring the lead
  | 'pitch'         // ROI math + grand slam offer
  | 'proposal'      // Sending proposal PDF
  | 'close'         // Payment link presented
  | 'onboard'       // Post-close asset collection
  | 'disqualified'  // Not a fit
  | 'booked';       // Booked a call instead

export interface LeadData {
  firstName?: string;
  lastName?: string;
  businessName?: string;
  phone?: string;
  email?: string;
  niche?: string;        // HVAC | Roofing | Plumbing | Electrical | Other
  truckCount?: number;
  avgJobValue?: number;
  currentFollowUp?: string;
  monthlyLeads?: number;
  timeline?: string;     // now | 30days | 3months | just_looking
  biggestPain?: string;
  hasWebsite?: boolean;
  hasOnlineBooking?: boolean;
}

export interface QualScore {
  total: number;        // 0–10
  breakdown: {
    teamSize: number;         // 0–2
    jobValue: number;         // 0–2
    followUpPain: number;     // 0–2
    timeline: number;         // 0–2
    engagement: number;       // 0–2
  };
  qualified: boolean;
  hot: boolean;         // score >= HOT_LEAD_SCORE
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface Session {
  id: string;
  stage: ConversationStage;
  messages: Message[];
  lead: LeadData;
  score: QualScore;
  createdAt: Date;
  updatedAt: Date;
  notifiedHot: boolean;
  proposalSent: boolean;
  closeLinkSent: boolean;
}
