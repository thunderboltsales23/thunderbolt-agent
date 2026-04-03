import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { Session, QualScore } from './types';
import { chat, getOpeningMessage } from './agent';
import { notifyHotLead, createGHLContact } from './notify';
import { sendProposal } from './email';
import * as fs from 'fs';
import * as path from 'path';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Sessions store (in-memory — sufficient for this use case)
const sessions = new Map<string, Session>();

// Clean up sessions older than 24 hours
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, session] of sessions.entries()) {
    if (session.createdAt.getTime() < cutoff) sessions.delete(id);
  }
}, 60 * 60 * 1000);

app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve the widget JS file
app.get('/widget.js', (req, res) => {
  const widgetPath = path.join(__dirname, '..', 'widget', 'chat.js');
  if (fs.existsSync(widgetPath)) {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(widgetPath);
  } else {
    res.status(404).json({ error: 'Widget not found' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', sessions: sessions.size });
});

// Start a new session
app.post('/session/start', (req, res) => {
  const id = uuidv4();
  const session: Session = {
    id,
    stage: 'hook',
    messages: [],
    lead: {},
    score: {
      total: 0,
      breakdown: { teamSize: 0, jobValue: 0, followUpPain: 0, timeline: 0, engagement: 0 },
      qualified: false,
      hot: false,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    notifiedHot: false,
    proposalSent: false,
    closeLinkSent: false,
  };

  sessions.set(id, session);
  const opening = getOpeningMessage();
  session.messages.push({ role: 'assistant', content: opening });

  res.json({
    sessionId: id,
    message: opening,
    stage: session.stage,
  });
});

// Send a message
app.post('/session/:id/message', async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message required' });
  }

  let session = sessions.get(id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  try {
    const { reply, session: updatedSession, actions } = await chat(session, message);
    sessions.set(id, updatedSession);

    // Execute actions async (don't block the response)
    setImmediate(async () => {
      for (const action of actions) {
        if (action === 'send_proposal') {
          await sendProposal(updatedSession.lead);
        }
        if (action === 'notify_hot') {
          await notifyHotLead(updatedSession);
        }
        if (action === 'create_contact') {
          await createGHLContact(updatedSession);
        }
      }
    });

    // Build response payload
    const payload: Record<string, unknown> = {
      message: reply,
      stage: updatedSession.stage,
      score: updatedSession.score.total,
    };

    // Attach CTAs based on actions
    if (actions.includes('show_payment_link')) {
      payload.cta = {
        type: 'payment',
        label: '⚡ Get Started — Pay Setup Fee',
        url: process.env.PAYMENT_LINK || '#',
      };
    } else if (actions.includes('show_booking')) {
      payload.cta = {
        type: 'booking',
        label: '📅 Book a 15-Min Call',
        url: process.env.BOOKING_URL || '#',
      };
    } else if (actions.includes('send_proposal')) {
      payload.cta = {
        type: 'info',
        label: '📄 Check your email — proposal incoming',
        url: null,
      };
    }

    return res.json(payload);
  } catch (err: any) {
    console.error('Chat error:', err.message);
    return res.status(500).json({ error: 'Something went wrong' });
  }
});

// Get session info (for debugging)
app.get('/session/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: session.id,
    stage: session.stage,
    score: session.score,
    lead: session.lead,
    messageCount: session.messages.length,
  });
});

app.listen(PORT, () => {
  console.log(`⚡ Thunderbolt Agent running on port ${PORT}`);
  console.log(`   Widget: GET /widget.js`);
  console.log(`   Health: GET /health`);
});
