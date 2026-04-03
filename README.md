# ⚡ Thunderbolt Agent — Piece 2

AI-powered sales agent that captures, qualifies, proposes, closes, and onboards — autonomously.

## How It Works

1. Visitor lands on your site
2. Chat widget opens with a pain-point hook ("When you miss a call, what happens to that lead?")
3. Agent collects name, business, phone, email naturally mid-conversation
4. Qualifies them (trucks, job value, follow-up system, timeline)
5. Surfaces the ROI math at the right moment
6. Emails the proposal PDF automatically
7. Presents payment link when hot
8. Notifies you via GHL when a hot lead hits
9. Collects onboarding assets post-close

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
| SMTP_USER | Gmail address for sending proposals |
| SMTP_PASS | Gmail App Password |
| FROM_EMAIL | From address |
| FROM_NAME | From name (e.g. "Ian | Thunderbolt Sales Systems") |
| PROPOSAL_PDF_URL | URL to your proposal PDF |
| PAYMENT_LINK | GHL invoice or Stripe link |
| BOOKING_URL | Calendar booking URL |
| HOT_LEAD_SCORE | Score threshold for hot lead alert (default: 7) |

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
- Their `PROPOSAL_PDF_URL`
- Customized `FROM_NAME` and `FROM_EMAIL`

One Anthropic API key handles all clients. Cost: ~$0.01–0.05 per conversation.
