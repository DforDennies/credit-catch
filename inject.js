(() => {
  let balanceBefore = null;
  let pendingConversation = false;
  let lastModel = null;
  let authToken = null;
  let workspaceId = null;
  let currentConvId = null;
  let activePollId = 0;
  const pageLoadTime = Date.now();

  function getConversationId() {
    const match = location.pathname.match(/\/c\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }

  const _fetch = window.fetch;

  function getWorkspaceId() {
    if (workspaceId) return workspaceId;
    try {
      const match = document.cookie.match(/(^|;\s*)_account=([^;]+)/);
      if (match) workspaceId = match[2];
    } catch (e) {
      console.warn('[Credit Catch] Cookie read error:', e.message);
    }
    return workspaceId;
  }

  async function getAuthToken(force) {
    if (authToken && !force) return authToken;
    try {
      const resp = await _fetch.call(window, '/api/auth/session', { credentials: 'include' });
      if (resp.ok) {
        const data = await resp.json();
        authToken = data.accessToken || data.access_token;
        if (!authToken) console.warn('[Credit Catch] No accessToken in session response');
      } else {
        console.warn('[Credit Catch] Session API status:', resp.status);
      }
    } catch (e) {
      console.warn('[Credit Catch] Session API error:', e.message);
    }
    return authToken;
  }

  async function fetchBalance() {
    const wsId = getWorkspaceId();
    if (!wsId) {
      console.warn('[Credit Catch] No workspace ID');
      return null;
    }
    const token = await getAuthToken();
    if (!token) {
      console.warn('[Credit Catch] No auth token');
      return null;
    }
    try {
      const resp = await _fetch.call(window, `/backend-api/accounts/${wsId}/remaining_balance`, {
        credentials: 'include',
        headers: { 'Authorization': 'Bearer ' + token },
      });
      if (resp.status === 401 || resp.status === 403) {
        console.warn('[Credit Catch] Balance API auth failed, refreshing token...');
        authToken = null;
        const newToken = await getAuthToken(true);
        if (!newToken) return null;
        const retry = await _fetch.call(window, `/backend-api/accounts/${wsId}/remaining_balance`, {
          credentials: 'include',
          headers: { 'Authorization': 'Bearer ' + newToken },
        });
        if (!retry.ok) return null;
        const d = await retry.json();
        return parseFloat(d.balance);
      }
      if (!resp.ok) {
        console.warn('[Credit Catch] Balance API status:', resp.status);
        return null;
      }
      const data = await resp.json();
      return parseFloat(data.balance);
    } catch (e) {
      console.warn('[Credit Catch] Balance fetch error:', e.message);
      return null;
    }
  }

  function isConvPrepare(url) {
    if (!url) return false;
    return url.split('?')[0].endsWith('/backend-api/f/conversation/prepare');
  }

  // Delayed init
  setTimeout(async () => {
    const bal = await fetchBalance();
    if (bal !== null) {
      balanceBefore = bal;
      console.log('[Credit Catch] Initial balance:', bal.toFixed(4));
      window.postMessage({ type: '__CREDIT_CATCH_BALANCE__', payload: { balance: bal } }, '*');
    } else {
      console.warn('[Credit Catch] Could not fetch initial balance, will retry on first message');
    }
  }, 2000);

  function getModelFromCookie() {
    try {
      const match = document.cookie.match(/(^|;\s*)oai-last-model-config=([^;]+)/);
      if (match) {
        const cfg = JSON.parse(decodeURIComponent(match[2]));
        return cfg.model || null;
      }
    } catch {}
    return null;
  }

  window.fetch = async function (...args) {
    const request = args[0];
    const url = typeof request === 'string' ? request : request?.url;
    const response = await _fetch.apply(this, args);
    if (!url) return response;

    // Extract workspace ID from balance URLs
    const balMatch = url.match(/\/accounts\/([^/]+)\/remaining_balance/);
    if (balMatch) workspaceId = balMatch[1];

    // Capture auth token from session calls
    if (url.includes('/api/auth/session') && response.ok) {
      try {
        const clone = response.clone();
        const data = await clone.json();
        if (data.accessToken) authToken = data.accessToken;
      } catch {}
    }

    // Conversation prepare: snapshot balance before message
    if (isConvPrepare(url) && response.ok) {
      // Ignore phantom prepare calls within 5s of page load
      if (Date.now() - pageLoadTime < 5000) {
        console.log('[Credit Catch] Ignoring phantom prepare (page load warmup)');
        return response;
      }

      lastModel = getModelFromCookie() || lastModel;
      currentConvId = getConversationId();

      // Snapshot balance for this poll — use local copy to avoid race with passive interception
      let snapshot = balanceBefore;
      if (snapshot === null) {
        const before = await fetchBalance();
        if (before !== null) {
          snapshot = before;
          balanceBefore = before;
        }
      }

      console.log('[Credit Catch] Prepare — model:', lastModel, 'conv:', currentConvId, 'before:', snapshot?.toFixed(4));

      // Cancel any previous poll and start a new one
      activePollId++;
      const myPollId = activePollId;
      pendingConversation = true;

      setTimeout(() => pollBalanceAfter(lastModel, snapshot, myPollId), 3000);
    }

    // Passively intercept balance — only update when no active poll
    if (url.includes('/remaining_balance') && response.ok) {
      try {
        const clone = response.clone();
        const data = await clone.json();
        const bal = parseFloat(data.balance);
        if (!pendingConversation) balanceBefore = bal;
        window.postMessage({ type: '__CREDIT_CATCH_BALANCE__', payload: { balance: bal } }, '*');
      } catch {}
    }

    return response;
  };

  async function pollBalanceAfter(model, snapshot, pollId) {
    // If a newer poll was started, abort this one
    if (pollId !== activePollId) {
      console.log('[Credit Catch] Poll', pollId, 'superseded by', activePollId);
      return;
    }

    if (snapshot === null) {
      console.warn('[Credit Catch] No before-balance snapshot, trying to fetch now...');
      const bal = await fetchBalance();
      if (bal !== null) {
        snapshot = bal;
        balanceBefore = bal;
        console.log('[Credit Catch] Late before-balance:', bal.toFixed(4));
      } else {
        console.warn('[Credit Catch] Still no balance, skipping poll');
        pendingConversation = false;
        return;
      }
    }

    let attempts = 0;
    const maxAttempts = 20;

    async function check() {
      // Abort if superseded
      if (pollId !== activePollId) {
        console.log('[Credit Catch] Poll', pollId, 'aborted (superseded)');
        return;
      }

      attempts++;
      const after = await fetchBalance();
      if (after === null) {
        if (attempts < maxAttempts) setTimeout(check, 2500);
        else { pendingConversation = false; }
        return;
      }

      // Compare against local snapshot, not the mutable global
      const delta = snapshot - after;
      if (delta > 0.001) {
        console.log(`[Credit Catch] Credits used: ${delta.toFixed(4)} (${snapshot.toFixed(4)} → ${after.toFixed(4)})`);
        window.postMessage({
          type: '__CREDIT_CATCH__',
          payload: {
            timestamp: Date.now(),
            model: model || 'unknown',
            credits_used: delta,
            balance_before: snapshot,
            balance_after: after,
            source: 'balance_delta',
            conversationId: currentConvId || getConversationId(),
          },
        }, '*');
        balanceBefore = after;
        pendingConversation = false;
        window.postMessage({ type: '__CREDIT_CATCH_BALANCE__', payload: { balance: after } }, '*');
      } else if (attempts < maxAttempts) {
        setTimeout(check, 2500);
      } else {
        console.log('[Credit Catch] No balance change after', maxAttempts, 'attempts');
        pendingConversation = false;
        balanceBefore = after;
      }
    }

    check();
  }

  // Watch for SPA navigation to detect conversation changes
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      const newConvId = getConversationId();
      if (newConvId !== currentConvId) {
        currentConvId = newConvId;
        window.postMessage({ type: '__CREDIT_CATCH_CONV_CHANGE__', payload: { conversationId: currentConvId } }, '*');
      }
    }
  }, 500);

  console.log('[Credit Catch] Interceptor v12 ready');
  window.postMessage({ type: '__CREDIT_CATCH_READY__' }, '*');
})();
