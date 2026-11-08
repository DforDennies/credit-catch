(() => {
  const STORAGE_KEY = 'creditCatchData';

  let sessionData = {
    today: new Date().toISOString().slice(0, 10),
    totalCredits: 0,
    totalCostUsd: 0,
    messages: 0,
    conversations: [],
    modelBreakdown: {},
  };

  let currentConvCredits = 0;
  let currentConvMessages = 0;
  let currentConvId = null;
  let healthStatus = { cookie: 'pending', auth: 'pending', balance: 'pending' };
  const LOCK_KEY = 'creditCatchPollLock';

  function getConvIdFromUrl() {
    const match = location.pathname.match(/\/c\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }

  function loadData() {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const saved = result[STORAGE_KEY];
      const today = new Date().toISOString().slice(0, 10);
      if (saved && saved.today === today) {
        sessionData = saved;
      } else {
        sessionData = {
          today,
          totalCredits: 0,
          totalCostUsd: 0,
          messages: 0,
          conversations: [],
          modelBreakdown: {},
        };
        chrome.storage.local.set({ [STORAGE_KEY]: sessionData });
      }
      recalcCurrentConv();
      updateWidget();
    });
  }

  function saveData() {
    chrome.storage.local.set({ [STORAGE_KEY]: sessionData });
  }

  function resetIfNewDay() {
    const today = new Date().toISOString().slice(0, 10);
    if (sessionData.today !== today) {
      sessionData = {
        today,
        totalCredits: 0,
        totalCostUsd: 0,
        messages: 0,
        conversations: [],
        modelBreakdown: {},
      };
      saveData();
    }
  }

  function recalcCurrentConv() {
    currentConvId = getConvIdFromUrl();
    if (!currentConvId || !sessionData.conversations.length) {
      currentConvCredits = 0;
      currentConvMessages = 0;
      return;
    }
    const convEntries = sessionData.conversations.filter(c => c.conversationId === currentConvId);
    currentConvCredits = convEntries.reduce((sum, c) => sum + (c.credits || 0), 0);
    currentConvMessages = convEntries.length;
  }

  function createWidget() {
    if (document.getElementById('credit-catch-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'credit-catch-widget';
    widget.innerHTML = `
      <style>
        #credit-catch-widget {
          position: fixed;
          bottom: 16px;
          right: 16px;
          z-index: 99999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 13px;
          color: #e0e0e0;
          background: #1a1a2e;
          border: 1px solid #333;
          border-radius: 12px;
          padding: 12px 16px;
          min-width: 220px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.4);
          cursor: move;
          user-select: none;
          transition: opacity 0.2s;
        }
        #credit-catch-widget:hover { opacity: 1 !important; }
        #credit-catch-widget .cc-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #fff;
        }
        #credit-catch-widget .cc-close {
          cursor: pointer; opacity: 0.5; font-size: 16px; line-height: 1;
        }
        #credit-catch-widget .cc-close:hover { opacity: 1; }
        #credit-catch-widget .cc-section-label {
          font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: 0.5px;
          margin-top: 8px; margin-bottom: 4px; padding-top: 6px; border-top: 1px solid #2a2a3e;
        }
        #credit-catch-widget .cc-section-label:first-of-type { margin-top: 0; border-top: none; padding-top: 0; }
        #credit-catch-widget .cc-row {
          display: flex; justify-content: space-between; padding: 2px 0;
        }
        #credit-catch-widget .cc-label { color: #888; font-size: 12px; }
        #credit-catch-widget .cc-value { color: #4fc3f7; font-weight: 500; font-variant-numeric: tabular-nums; font-size: 12px; }
        #credit-catch-widget .cc-value.cc-credits { color: #66bb6a; font-size: 16px; }
        #credit-catch-widget .cc-value.cc-conv-credits { color: #81c784; font-size: 14px; }
        #credit-catch-widget .cc-value.cc-cost { color: #ffb74d; }
        #credit-catch-widget .cc-latest {
          margin-top: 6px; padding-top: 6px; border-top: 1px solid #333;
          font-size: 11px; color: #666;
        }
        #credit-catch-widget .cc-latest .cc-model {
          display: inline-block; background: #2a2a3e; padding: 1px 6px;
          border-radius: 4px; color: #aaa; font-size: 11px;
        }
        #credit-catch-widget .cc-flash { animation: cc-pulse 0.6s ease-out; }
        @keyframes cc-pulse { 0% { background: #1a3a2e; } 100% { background: #1a1a2e; } }
        #credit-catch-widget .cc-minimize { cursor: pointer; opacity: 0.5; font-size: 14px; }
        #credit-catch-widget .cc-minimize:hover { opacity: 1; }
        #credit-catch-widget.cc-minimized .cc-body,
        #credit-catch-widget.cc-minimized .cc-latest,
        #credit-catch-widget.cc-minimized .cc-health { display: none; }
        #credit-catch-widget.cc-minimized { min-width: auto; }
        #credit-catch-widget .cc-health {
          margin-top: 6px; padding-top: 6px; border-top: 1px solid #333;
          font-size: 11px;
        }
        #credit-catch-widget .cc-health-row {
          display: flex; justify-content: space-between; padding: 1px 0;
        }
        #credit-catch-widget .cc-health-label { color: #666; }
        #credit-catch-widget .cc-health-status { font-weight: 500; }
        #credit-catch-widget .cc-health-status.ok { color: #66bb6a; }
        #credit-catch-widget .cc-health-status.fail { color: #ef5350; }
        #credit-catch-widget .cc-health-status.pending { color: #ffb74d; }
      </style>
      <div class="cc-header">
        <span class="cc-title">Credit Catch</span>
        <span>
          <span class="cc-minimize" id="cc-minimize">−</span>
          <span class="cc-close" id="cc-close">×</span>
        </span>
      </div>
      <div class="cc-body">
        <div class="cc-section-label">This Conversation</div>
        <div class="cc-row">
          <span class="cc-label">Credits</span>
          <span class="cc-value cc-conv-credits" id="cc-conv-credits">0.00</span>
        </div>
        <div class="cc-row">
          <span class="cc-label">Messages</span>
          <span class="cc-value" id="cc-conv-msgs">0</span>
        </div>
        <div class="cc-section-label">Today Total</div>
        <div class="cc-row">
          <span class="cc-label">Credits</span>
          <span class="cc-value cc-credits" id="cc-total-credits">0.00</span>
        </div>
        <div class="cc-row">
          <span class="cc-label">Est. Cost</span>
          <span class="cc-value cc-cost" id="cc-total-cost">$0.0000</span>
        </div>
        <div class="cc-row">
          <span class="cc-label">Messages</span>
          <span class="cc-value" id="cc-msg-count">0</span>
        </div>
        <div class="cc-row">
          <span class="cc-label">Balance</span>
          <span class="cc-value" id="cc-balance">--</span>
        </div>
      </div>
      <div class="cc-health" id="cc-health">
        <div class="cc-health-row">
          <span class="cc-health-label">Cookie</span>
          <span class="cc-health-status pending" id="cc-h-cookie">...</span>
        </div>
        <div class="cc-health-row">
          <span class="cc-health-label">Auth Token</span>
          <span class="cc-health-status pending" id="cc-h-auth">...</span>
        </div>
        <div class="cc-health-row">
          <span class="cc-health-label">Balance API</span>
          <span class="cc-health-status pending" id="cc-h-balance">...</span>
        </div>
      </div>
      <div class="cc-latest" id="cc-latest">Waiting for first message...</div>
    `;

    document.body.appendChild(widget);

    document.getElementById('cc-close').addEventListener('click', () => {
      widget.style.display = 'none';
    });

    document.getElementById('cc-minimize').addEventListener('click', () => {
      widget.classList.toggle('cc-minimized');
      document.getElementById('cc-minimize').textContent =
        widget.classList.contains('cc-minimized') ? '+' : '−';
    });

    makeDraggable(widget);
  }

  function makeDraggable(el) {
    let offsetX, offsetY, dragging = false;
    el.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('cc-close') || e.target.classList.contains('cc-minimize')) return;
      dragging = true;
      offsetX = e.clientX - el.getBoundingClientRect().left;
      offsetY = e.clientY - el.getBoundingClientRect().top;
      el.style.transition = 'none';
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      el.style.left = (e.clientX - offsetX) + 'px';
      el.style.top = (e.clientY - offsetY) + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => {
      dragging = false;
      el.style.transition = '';
    });
  }

  function updateWidget() {
    const el = (id) => document.getElementById(id);
    if (!el('cc-total-credits')) return;

    el('cc-total-credits').textContent = sessionData.totalCredits.toFixed(2);
    el('cc-total-cost').textContent = '$' + (sessionData.totalCredits * 0.04).toFixed(4);
    el('cc-msg-count').textContent = sessionData.messages;
    el('cc-conv-credits').textContent = currentConvCredits.toFixed(2);
    el('cc-conv-msgs').textContent = currentConvMessages;

    const widget = document.getElementById('credit-catch-widget');
    if (widget) {
      widget.classList.add('cc-flash');
      setTimeout(() => widget.classList.remove('cc-flash'), 600);
    }
  }

  function handleCreditCatch(payload) {
    resetIfNewDay();

    if (payload.source === 'balance_delta' && payload.credits_used > 0) {
      sessionData.totalCredits += payload.credits_used;
      sessionData.messages += 1;

      const model = payload.model || 'unknown';
      sessionData.modelBreakdown[model] = (sessionData.modelBreakdown[model] || 0) + payload.credits_used;

      const convId = payload.conversationId || getConvIdFromUrl();

      sessionData.conversations.push({
        timestamp: payload.timestamp,
        model,
        credits: payload.credits_used,
        source: 'balance_delta',
        conversationId: convId,
      });

      if (convId && convId === getConvIdFromUrl()) {
        currentConvCredits += payload.credits_used;
        currentConvMessages += 1;
      }

      saveData();
      updateWidget();

      const latest = document.getElementById('cc-latest');
      if (latest) {
        latest.innerHTML =
          `Last: <span class="cc-model">${model}</span> ` +
          `${payload.credits_used.toFixed(3)} credits`;
      }
    }
  }

  function handleBalance(payload) {
    const el = document.getElementById('cc-balance');
    if (el && payload.balance !== undefined) {
      const b = payload.balance;
      el.textContent = b < 0 ? 'Unlimited' : b.toFixed(1);
    }
  }

  function handleConvChange(payload) {
    currentConvId = payload.conversationId;
    recalcCurrentConv();
    updateWidget();
  }

  function updateHealth(status) {
    healthStatus = status;
    const icons = { ok: '✅', fail: '❌', pending: '⏳' };
    const labels = { ok: 'OK', fail: 'Failed', pending: 'Checking...' };
    for (const key of ['cookie', 'auth', 'balance']) {
      const el = document.getElementById(`cc-h-${key}`);
      if (el) {
        el.textContent = `${icons[status[key]] || '❓'} ${labels[status[key]] || status[key]}`;
        el.className = `cc-health-status ${status[key]}`;
      }
    }
    const healthEl = document.getElementById('cc-health');
    if (healthEl && status.cookie === 'ok' && status.auth === 'ok' && status.balance === 'ok') {
      setTimeout(() => { healthEl.style.display = 'none'; }, 5000);
    }
  }

  function handlePollLock(payload) {
    chrome.storage.local.set({ [LOCK_KEY]: { tabId: payload.tabId, timestamp: payload.timestamp } });
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data?.type === '__CREDIT_CATCH__') {
      chrome.storage.local.get(LOCK_KEY, (result) => {
        const lock = result[LOCK_KEY];
        if (lock && e.data.payload.tabId && lock.tabId !== e.data.payload.tabId) {
          const age = Date.now() - (lock.timestamp || 0);
          if (age < 60000) {
            console.log('[Credit Catch] Ignoring credit from different tab (lock held by', lock.tabId, ')');
            return;
          }
        }
        handleCreditCatch(e.data.payload);
      });
    }
    if (e.data?.type === '__CREDIT_CATCH_BALANCE__') {
      handleBalance(e.data.payload);
    }
    if (e.data?.type === '__CREDIT_CATCH_CONV_CHANGE__') {
      handleConvChange(e.data.payload);
    }
    if (e.data?.type === '__CREDIT_CATCH_HEALTH__') {
      updateHealth(e.data.payload);
    }
    if (e.data?.type === '__CREDIT_CATCH_POLL_LOCK__') {
      handlePollLock(e.data.payload);
    }
    if (e.data?.type === '__CREDIT_CATCH_READY__') {
      console.log('[Credit Catch] Interceptor ready');
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      createWidget();
      loadData();
    });
  } else {
    createWidget();
    loadData();
  }
})();
