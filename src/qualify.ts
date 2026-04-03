import { LeadData, QualScore } from './types';

export function scoreLead(lead: LeadData, messageCount: number): QualScore {
  const breakdown = {
    // Team size: solo = 0, 1-2 trucks = 1, 3+ trucks = 2
    teamSize: !lead.truckCount ? 0
      : lead.truckCount === 1 ? 0
      : lead.truckCount <= 3 ? 1
      : 2,

    // Job value: under $500 = 0, $500-2k = 1, $2k+ = 2
    jobValue: !lead.avgJobValue ? 0
      : lead.avgJobValue < 500 ? 0
      : lead.avgJobValue < 2000 ? 1
      : 2,

    // Follow-up pain: has system = 0, manual = 1, nothing = 2
    followUpPain: !lead.currentFollowUp ? 1
      : lead.currentFollowUp.toLowerCase().includes('nothing')
        || lead.currentFollowUp.toLowerCase().includes('none')
        || lead.currentFollowUp.toLowerCase().includes('no') ? 2
      : lead.currentFollowUp.toLowerCase().includes('manual')
        || lead.currentFollowUp.toLowerCase().includes('call back') ? 1
      : 0,

    // Timeline: now = 2, 30 days = 1, 3 months = 0, just looking = 0
    timeline: !lead.timeline ? 0
      : lead.timeline === 'now' ? 2
      : lead.timeline === '30days' ? 1
      : 0,

    // Engagement: how many messages deep (proxy for interest)
    engagement: messageCount >= 8 ? 2 : messageCount >= 4 ? 1 : 0,
  };

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const hotScore = parseInt(process.env.HOT_LEAD_SCORE || '7', 10);

  return {
    total,
    breakdown,
    qualified: total >= 4,
    hot: total >= hotScore,
  };
}

export function isDisqualified(lead: LeadData): string | null {
  if (lead.truckCount !== undefined && lead.truckCount < 1) {
    return 'Solo operator — not a fit for Thunderbolt system yet';
  }
  if (lead.avgJobValue !== undefined && lead.avgJobValue < 300) {
    return 'Average job value too low for the math to work';
  }
  return null;
}
