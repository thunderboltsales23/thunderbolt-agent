import axios from 'axios';
import { Session } from './types';

export async function notifyHotLead(session: Session): Promise<void> {
  const url = process.env.GHL_WEBHOOK_URL;
  if (!url) return;

  const { lead, score } = session;

  try {
    await axios.post(url, {
      event: 'hot_lead',
      sessionId: session.id,
      score: score.total,
      lead: {
        firstName: lead.firstName || '',
        lastName: lead.lastName || '',
        businessName: lead.businessName || '',
        phone: lead.phone || '',
        email: lead.email || '',
        niche: lead.niche || '',
        truckCount: lead.truckCount,
        avgJobValue: lead.avgJobValue,
        timeline: lead.timeline,
        biggestPain: lead.biggestPain,
      },
      message: `🔥 HOT LEAD: ${lead.firstName} ${lead.lastName} @ ${lead.businessName} — Score ${score.total}/10. Phone: ${lead.phone}`,
      tags: ['thunderbolt-lead', 'hot-lead', lead.niche || 'unknown'].filter(Boolean),
    });
    console.log(`✓ Hot lead notification sent for ${lead.firstName} ${lead.lastName}`);
  } catch (err: any) {
    console.warn('⚠ GHL notification failed:', err.message);
  }
}

export async function createGHLContact(session: Session): Promise<void> {
  const url = process.env.GHL_WEBHOOK_URL;
  if (!url) return;

  const { lead } = session;

  try {
    await axios.post(url, {
      event: 'new_contact',
      sessionId: session.id,
      firstName: lead.firstName || '',
      lastName: lead.lastName || '',
      name: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
      email: lead.email || '',
      phone: lead.phone || '',
      companyName: lead.businessName || '',
      tags: ['thunderbolt-lead', 'website-chat', lead.niche || ''].filter(Boolean),
      customFields: {
        niche: lead.niche || '',
        truck_count: lead.truckCount || '',
        avg_job_value: lead.avgJobValue || '',
        timeline: lead.timeline || '',
        biggest_pain: lead.biggestPain || '',
        lead_score: session.score.total,
        source: 'thunderbolt-chat-agent',
      },
    });
    console.log(`✓ GHL contact created for ${lead.firstName} ${lead.lastName}`);
  } catch (err: any) {
    console.warn('⚠ GHL contact creation failed:', err.message);
  }
}
