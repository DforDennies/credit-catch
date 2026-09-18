const STORAGE_KEY = 'creditCatchData';

function render(data) {
  document.getElementById('total-credits').textContent =
    data.totalCredits.toFixed(2);
  document.getElementById('total-cost').textContent =
    '$' + (data.totalCredits * 0.04).toFixed(4);
  document.getElementById('total-messages').textContent =
    data.messages || data.conversations?.length || 0;

  const msgCount = data.messages || data.conversations?.length || 0;
  const avg = msgCount > 0 ? data.totalCredits / msgCount : 0;
  document.getElementById('avg-credits').textContent = avg.toFixed(2);

  const history = document.getElementById('history');
  if (!data.conversations || !data.conversations.length) {
    history.innerHTML = '<div class="empty">No messages yet today</div>';
    return;
  }

  history.innerHTML = data.conversations
    .slice()
    .reverse()
    .slice(0, 50)
    .map((c) => {
      const time = new Date(c.timestamp).toLocaleTimeString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const credits = c.credits
        ? c.credits.toFixed(3)
        : c.estimate
          ? c.estimate.estimated_credits.toFixed(3)
          : '?';
      const model = c.model || 'unknown';
      return `
        <div class="history-item">
          <span>
            <span class="history-model">${model}</span>
          </span>
          <span>
            <span class="history-credits">${credits} cr</span>
            <span class="history-time" style="margin-left:6px;">${time}</span>
          </span>
        </div>`;
    })
    .join('');
}

function exportCSV(data) {
  const rows = [
    ['timestamp', 'model', 'credits', 'source', 'conversation_id'],
  ];
  for (const c of (data.conversations || [])) {
    const credits = c.credits
      ? c.credits.toFixed(6)
      : c.estimate
        ? c.estimate.estimated_credits.toFixed(6)
        : '';
    rows.push([
      new Date(c.timestamp).toISOString(),
      c.model || 'unknown',
      credits,
      c.source || 'unknown',
      c.conversationId || '',
    ]);
  }
  const csv = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `credit-catch-${data.today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

chrome.storage.local.get(STORAGE_KEY, (result) => {
  const data = result[STORAGE_KEY] || {
    today: new Date().toISOString().slice(0, 10),
    totalCredits: 0,
    messages: 0,
    conversations: [],
  };
  render(data);

  document.getElementById('export-btn').addEventListener('click', () => {
    exportCSV(data);
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('Reset today\'s data?')) {
      const empty = {
        today: new Date().toISOString().slice(0, 10),
        totalCredits: 0,
        messages: 0,
        conversations: [],
        modelBreakdown: {},
      };
      chrome.storage.local.set({ [STORAGE_KEY]: empty }, () => {
        render(empty);
      });
    }
  });
});
