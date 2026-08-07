# ⚡ Thunderbolt Agent — Piece 2

AI-powered sales agent that captures, qualifies, closes, and onboards — autonomously.

## The Offer

The agent sells one thing. There are no tiers.

**The N.B.O. (No-Brainer Offer) — $297/month. No setup fee. No contracts.**

- Managed Meta Ads campaigns
- A professional website
- A 24/7 AI appointment setter
- Automated review generation
- 30-day satisfaction guarantee
- Limited to 10 contractors per market

## How It Works

1. Visitor lands on your site
2. Chat widget opens with a pain-point hook ("When you miss a call, what happens to that lead?")
3. Agent collects name, business, trade, service area, email, and phone mid-conversation
4. Qualifies them (trade, service area, job value, follow-up system, timeline)
5. Surfaces the ROI math at the right moment
6. **Closes by sending the payment link** — not by booking a call
7. Notifies you via GHL when a hot lead hits
8. Collects onboarding assets post-close

Booking a call is a fallback only: the agent will hand over the calendar link if a prospect
explicitly asks to talk to a human first, but it never suggests a call on its own.

## Embed on Your Website

### Widget (floating button, bottom-right corner)
```html
<script>
  window.ThunderboltAgent = {
    agentUrl: 'https://YOUR-RAILWAY-URL.up.railway.app',
    mode: 'widget'
  };
</script>
<script src="https://YOUR-RAILWAY-URL.up.railway.app/widget.js"></script>
```

### Embed (inside a page section)
```html
<div id="chat-container"></div>
<script>
  window.ThunderboltAgent = {
    agentUrl: 'https://YOUR-RAILWAY-URL.up.railway.app',
    mode: 'embed',
    target: '#chat-container'
  };
</script>
<script src="https://YOUR-RAILWAY-URL.up.railway.app/widget.js"></script>
```

### Popup (exit-intent or timer)
```html
<script>
  window.ThunderboltAgent = {
    agentUrl: 'https://YOUR-RAILWAY-URL.up.railway.app',
    mode: 'popup',
    popupDelay: 20000,
    exitIntent: true
  };
</script>
<script src="https://YOUR-RAILWAY-URL.up.railway.app/widget.js"></script>
```

## Environment Variables (set in Railway)

| Variable | Description |
|---|---|
| ANTHROPIC_API_KEY | Your Anthropic API key |
| GHL_WEBHOOK_URL | GHL webhook URL for lead notifications |
| PAYMENT_LINK | The N.B.O. payment link — the agent's close |
| BOOKING_URL | Calendar link, used only on explicit request for a human |
| HOT_LEAD_SCORE | Score threshold for hot lead alert (default: 7) |

## Tests

```bash
npm test
```

Builds, then runs `tests/agent.test.mjs` against the real server from `./dist`
with only the Anthropic SDK stubbed — no API key needed, no cost. Covers the
conversion path: that `[CLOSE_READY]` serves the payment link, that booking
stays a fallback, that lead fields (trade, service area, email, phone, job
value) are extracted, and that control tags never leak into the chat.

What it deliberately does **not** cover is the model's own wording — that it
quotes $297, names N.B.O., and never proposes a call on its own. That
behavior lives in the system prompt in `src/agent.ts` and can only be checked
against the live API. After changing the prompt, run a few real conversations
against the deployed service and confirm those three things by hand.

## Deploy to Railway
1. Push to GitHub
2. Railway → New Project → GitHub Repo
3. Set all env vars above
4. Deploy
5. Add `widget.js` embed to your GHL site

## Reselling to Clients
For each client, create a new Railway service with:
- Their `GHL_WEBHOOK_URL`
- Their `PAYMENT_LINK`
- Their `BOOKING_URL`

One Anthropic API key handles all clients. Cost: ~$0.01–0.05 per conversation.
