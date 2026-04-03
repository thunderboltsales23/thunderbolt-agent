(function() {
  'use strict';

  // Config — injected by the embed script or defaults
  var config = window.ThunderboltAgent || {};
  var AGENT_URL = config.agentUrl || 'https://thunderbolt-agent.up.railway.app';
  var MODE = config.mode || 'widget'; // 'widget' | 'embed' | 'popup'
  var EMBED_TARGET = config.target || null; // CSS selector for embed mode
  var PRIMARY_COLOR = config.primaryColor || '#F5C518';
  var BG_COLOR = config.bgColor || '#0a0a0a';
  var POPUP_DELAY = config.popupDelay || 15000; // ms before popup appears
  var POPUP_EXIT = config.exitIntent !== false; // exit-intent trigger

  var sessionId = null;
  var isOpen = false;
  var isLoading = false;

  // ── STYLES ────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = `
    #tb-agent-widget * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    #tb-agent-widget { position: fixed; bottom: 24px; right: 24px; z-index: 999999; }
    #tb-agent-bubble {
      width: 60px; height: 60px; border-radius: 50%;
      background: ${PRIMARY_COLOR}; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 20px rgba(245,197,24,0.5);
      transition: transform 0.2s, box-shadow 0.2s;
      border: none; outline: none;
    }
    #tb-agent-bubble:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(245,197,24,0.7); }
    #tb-agent-bubble svg { width: 28px; height: 28px; }
    #tb-agent-window {
      position: absolute; bottom: 72px; right: 0;
      width: 360px; height: 520px;
      background: ${BG_COLOR}; border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      display: none; flex-direction: column; overflow: hidden;
      border: 1px solid rgba(245,197,24,0.2);
    }
    #tb-agent-window.open { display: flex; animation: tb-slideup 0.3s ease; }
    @keyframes tb-slideup { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    #tb-agent-header {
      background: ${PRIMARY_COLOR}; padding: 14px 16px;
      display: flex; align-items: center; justify-content: space-between;
    }
    #tb-agent-header-left { display: flex; align-items: center; gap: 10px; }
    #tb-agent-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: #0a0a0a; display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: bold; color: ${PRIMARY_COLOR};
    }
    #tb-agent-header-info h4 { margin: 0; font-size: 14px; font-weight: 700; color: #0a0a0a; }
    #tb-agent-header-info p { margin: 0; font-size: 11px; color: rgba(0,0,0,0.6); }
    #tb-agent-close { background: none; border: none; cursor: pointer; color: #0a0a0a; font-size: 20px; line-height: 1; padding: 0; }
    #tb-agent-messages {
      flex: 1; overflow-y: auto; padding: 16px; display: flex;
      flex-direction: column; gap: 10px;
      scrollbar-width: thin; scrollbar-color: rgba(245,197,24,0.3) transparent;
    }
    .tb-msg {
      max-width: 85%; padding: 10px 14px; border-radius: 12px;
      font-size: 13.5px; line-height: 1.5; animation: tb-msgin 0.2s ease;
    }
    @keyframes tb-msgin { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    .tb-msg.agent { background: #1a1a2e; color: #e8e8e8; border-bottom-left-radius: 4px; align-self: flex-start; }
    .tb-msg.user { background: ${PRIMARY_COLOR}; color: #0a0a0a; font-weight: 500; border-bottom-right-radius: 4px; align-self: flex-end; }
    .tb-typing { display: flex; gap: 4px; padding: 12px 14px; }
    .tb-typing span { width: 7px; height: 7px; border-radius: 50%; background: rgba(245,197,24,0.5); animation: tb-bounce 1.2s infinite; }
    .tb-typing span:nth-child(2) { animation-delay: 0.2s; }
    .tb-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes tb-bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
    .tb-cta-btn {
      display: block; margin: 8px 0 4px; padding: 10px 16px; border-radius: 8px;
      background: ${PRIMARY_COLOR}; color: #0a0a0a; font-weight: 700;
      text-decoration: none; font-size: 13px; text-align: center;
      border: none; cursor: pointer; width: 100%;
      box-shadow: 0 2px 12px rgba(245,197,24,0.3);
      transition: box-shadow 0.2s;
    }
    .tb-cta-btn:hover { box-shadow: 0 4px 20px rgba(245,197,24,0.5); }
    .tb-cta-info {
      display: block; margin: 6px 0; padding: 8px 14px;
      background: rgba(245,197,24,0.1); border: 1px solid rgba(245,197,24,0.3);
      border-radius: 8px; color: ${PRIMARY_COLOR}; font-size: 12px; text-align: center;
    }
    #tb-agent-input-row {
      padding: 12px; border-top: 1px solid rgba(255,255,255,0.06);
      display: flex; gap: 8px; align-items: flex-end;
    }
    #tb-agent-input {
      flex: 1; background: #1a1a2e; border: 1px solid rgba(245,197,24,0.2);
      border-radius: 10px; padding: 10px 14px; color: #e8e8e8;
      font-size: 13px; resize: none; outline: none; max-height: 100px;
      transition: border-color 0.2s; line-height: 1.4;
    }
    #tb-agent-input:focus { border-color: ${PRIMARY_COLOR}; }
    #tb-agent-input::placeholder { color: rgba(255,255,255,0.3); }
    #tb-agent-send {
      width: 38px; height: 38px; border-radius: 50%; border: none;
      background: ${PRIMARY_COLOR}; cursor: pointer; display: flex;
      align-items: center; justify-content: center; flex-shrink: 0;
      transition: transform 0.15s;
    }
    #tb-agent-send:hover { transform: scale(1.05); }
    #tb-agent-send svg { width: 16px; height: 16px; }
    #tb-agent-footer { padding: 6px 12px 8px; text-align: center; }
    #tb-agent-footer span { font-size: 10px; color: rgba(255,255,255,0.2); }
    /* Embed mode */
    .tb-embed-container {
      width: 100%; max-width: 480px; border-radius: 16px; overflow: hidden;
      border: 1px solid rgba(245,197,24,0.2); background: ${BG_COLOR};
      display: flex; flex-direction: column; height: 560px;
    }
    /* Popup mode */
    #tb-popup-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.7);
      z-index: 999998; display: flex; align-items: center; justify-content: center;
      animation: tb-fadein 0.3s ease;
    }
    @keyframes tb-fadein { from { opacity: 0; } to { opacity: 1; } }
    #tb-popup-box {
      width: 400px; max-width: 94vw; background: ${BG_COLOR};
      border-radius: 16px; overflow: hidden;
      border: 1px solid rgba(245,197,24,0.2);
      box-shadow: 0 24px 80px rgba(0,0,0,0.6);
      animation: tb-popin 0.3s ease;
    }
    @keyframes tb-popin { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
    #tb-popup-box .tb-embed-container { height: 500px; border: none; border-radius: 0; max-width: 100%; }
    @media (max-width: 480px) {
      #tb-agent-widget { bottom: 16px; right: 16px; }
      #tb-agent-window { width: calc(100vw - 32px); right: 0; }
    }
  `;
  document.head.appendChild(style);

  // ── BUILD CHAT UI ─────────────────────────────────────────────────────
  function buildChatUI(container, isEmbedded) {
    container.innerHTML = `
      <div id="tb-agent-header">
        <div id="tb-agent-header-left">
          <div id="tb-agent-avatar">⚡</div>
          <div id="tb-agent-header-info">
            <h4>Thunderbolt Sales AI</h4>
            <p>Typically replies instantly</p>
          </div>
        </div>
        ${!isEmbedded ? '<button id="tb-agent-close">×</button>' : ''}
      </div>
      <div id="tb-agent-messages"></div>
      <div id="tb-agent-input-row">
        <textarea id="tb-agent-input" placeholder="Type your message..." rows="1"></textarea>
        <button id="tb-agent-send">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
      <div id="tb-agent-footer"><span>Powered by ⚡ Thunderbolt</span></div>
    `;
  }

  // ── MESSAGE RENDERING ─────────────────────────────────────────────────
  function addMessage(text, role, cta) {
    var messages = document.getElementById('tb-agent-messages');
    if (!messages) return;

    var msg = document.createElement('div');
    msg.className = 'tb-msg ' + role;
    msg.textContent = text;
    messages.appendChild(msg);

    if (cta) {
      var ctaEl = document.createElement(cta.url ? 'a' : 'span');
      ctaEl.className = cta.type === 'info' ? 'tb-cta-info' : 'tb-cta-btn';
      ctaEl.textContent = cta.label;
      if (cta.url) {
        ctaEl.href = cta.url;
        ctaEl.target = '_blank';
        ctaEl.rel = 'noopener';
      }
      messages.appendChild(ctaEl);
    }

    messages.scrollTop = messages.scrollHeight;
  }

  function showTyping() {
    var messages = document.getElementById('tb-agent-messages');
    if (!messages) return;
    var typing = document.createElement('div');
    typing.className = 'tb-msg agent tb-typing-indicator';
    typing.innerHTML = '<div class="tb-typing"><span></span><span></span><span></span></div>';
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;
  }

  function hideTyping() {
    var el = document.querySelector('.tb-typing-indicator');
    if (el) el.remove();
  }

  // ── API CALLS ─────────────────────────────────────────────────────────
  function startSession(callback) {
    fetch(AGENT_URL + '/session/start', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        sessionId = data.sessionId;
        callback(data.message);
      })
      .catch(function(err) { console.error('Thunderbolt Agent: start error', err); });
  }

  function sendMessage(text, callback) {
    if (!sessionId) return;
    isLoading = true;
    fetch(AGENT_URL + '/session/' + sessionId + '/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        isLoading = false;
        callback(data);
      })
      .catch(function(err) {
        isLoading = false;
        console.error('Thunderbolt Agent: message error', err);
        callback({ message: "Something went wrong on my end. Try again in a moment." });
      });
  }

  // ── EVENT HANDLERS ────────────────────────────────────────────────────
  function handleSend() {
    if (isLoading) return;
    var input = document.getElementById('tb-agent-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;

    addMessage(text, 'user', null);
    input.value = '';
    input.style.height = 'auto';

    showTyping();
    sendMessage(text, function(data) {
      hideTyping();
      addMessage(data.message, 'agent', data.cta || null);
    });
  }

  function initEventListeners() {
    var sendBtn = document.getElementById('tb-agent-send');
    var input = document.getElementById('tb-agent-input');
    var closeBtn = document.getElementById('tb-agent-close');

    if (sendBtn) sendBtn.addEventListener('click', handleSend);
    if (input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
      });
      input.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
      });
    }
    if (closeBtn) closeBtn.addEventListener('click', function() { toggleWidget(false); });
  }

  // ── WIDGET MODE ───────────────────────────────────────────────────────
  function initWidget() {
    var wrapper = document.createElement('div');
    wrapper.id = 'tb-agent-widget';

    var win = document.createElement('div');
    win.id = 'tb-agent-window';
    buildChatUI(win, false);
    wrapper.appendChild(win);

    var bubble = document.createElement('button');
    bubble.id = 'tb-agent-bubble';
    bubble.setAttribute('aria-label', 'Chat with Thunderbolt Sales AI');
    bubble.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
    bubble.addEventListener('click', function() { toggleWidget(!isOpen); });
    wrapper.appendChild(bubble);

    document.body.appendChild(wrapper);
    initEventListeners();

    startSession(function(msg) {
      addMessage(msg, 'agent', null);
    });
  }

  function toggleWidget(open) {
    isOpen = open;
    var win = document.getElementById('tb-agent-window');
    if (win) win.classList.toggle('open', open);
    if (open) {
      var input = document.getElementById('tb-agent-input');
      if (input) setTimeout(function() { input.focus(); }, 100);
    }
  }

  // ── EMBED MODE ────────────────────────────────────────────────────────
  function initEmbed() {
    var target = EMBED_TARGET ? document.querySelector(EMBED_TARGET) : null;
    if (!target) { console.warn('Thunderbolt Agent: embed target not found'); return; }

    var container = document.createElement('div');
    container.className = 'tb-embed-container';
    buildChatUI(container, true);
    target.appendChild(container);
    initEventListeners();

    startSession(function(msg) { addMessage(msg, 'agent', null); });
  }

  // ── POPUP MODE ────────────────────────────────────────────────────────
  function initPopup() {
    var shown = false;

    function showPopup() {
      if (shown) return;
      shown = true;

      var overlay = document.createElement('div');
      overlay.id = 'tb-popup-overlay';
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.remove();
      });

      var box = document.createElement('div');
      box.id = 'tb-popup-box';
      var container = document.createElement('div');
      container.className = 'tb-embed-container';
      buildChatUI(container, false);
      box.appendChild(container);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      initEventListeners();
      startSession(function(msg) { addMessage(msg, 'agent', null); });

      var closeBtn = document.getElementById('tb-agent-close');
      if (closeBtn) closeBtn.addEventListener('click', function() { overlay.remove(); });
    }

    // Timer trigger
    setTimeout(showPopup, POPUP_DELAY);

    // Exit intent trigger
    if (POPUP_EXIT) {
      document.addEventListener('mouseleave', function(e) {
        if (e.clientY <= 0) showPopup();
      });
    }
  }

  // ── INIT ──────────────────────────────────────────────────────────────
  function init() {
    if (MODE === 'widget') initWidget();
    else if (MODE === 'embed') initEmbed();
    else if (MODE === 'popup') initPopup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
