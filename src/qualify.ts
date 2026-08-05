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

// At $297/month with no setup fee, solo operators and lower-ticket trades now
// pencil out, so the old team-size and job-value floors no longer disqualify.
// Only a job value that can't clear a single month of the system does.
export function isDisqualified(lead: LeadData): string | null {
  if (lead.avgJobValue !== undefined && lead.avgJobValue < 297) {
    return 'Average job value below the $297/month cost — the math does not work';
  }
  return null;
}
