# Credit Catch

A Chrome Extension that monitors real-time ChatGPT credit consumption. See exactly how many credits each message costs, track per-conversation usage, and export daily history.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green?logo=googlechrome)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- **Real-time credit tracking** — Detects credit consumption via balance delta after each message
- **Per-conversation breakdown** — See how much each conversation costs separately
- **Floating widget** — Always-visible, draggable, minimizable overlay on ChatGPT
- **Model detection** — Automatically identifies which model was used (GPT-4o, o1, GPT-5, etc.)
- **Daily summary** — Total credits, estimated USD cost, message count
- **Popup dashboard** — Detailed stats and recent message history
- **CSV export** — Export daily usage data with conversation IDs
- **Auto daily reset** — Stats reset at midnight, fresh start each day

## How It Works

Credit Catch uses a **balance delta approach**:

1. Intercepts ChatGPT's `conversation/prepare` API call (fired before each message)
2. Snapshots your current credit balance
3. Polls the balance API after the response completes
4. Calculates the exact credit consumption from the difference

This means it tracks **actual credits charged**, not estimates.

## Widget

The floating widget shows two sections:

| Section | Info |
|---------|------|
| **This Conversation** | Credits and message count for the current chat |
| **Today Total** | Cumulative credits, estimated cost (USD), messages, and balance |

The widget is draggable, minimizable, and auto-updates after each message.

## Installation

1. Clone or download this repository
   ```bash
   git clone https://github.com/DforDennies/credit-catch.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** (top right toggle)

4. Click **Load unpacked** and select the `credit-catch` folder

5. Navigate to [chatgpt.com](https://chatgpt.com) — the widget appears in the bottom-right corner

## Usage

- **Send a message** on ChatGPT — credits are tracked automatically
- **Switch conversations** — the "This Conversation" section updates to show that conversation's usage
- **Click the extension icon** — opens the popup with detailed stats
- **Export CSV** — click "Export CSV" in the popup for a spreadsheet-friendly download
- **Drag the widget** — reposition it anywhere on the page
- **Minimize** — click `−` to collapse, `+` to expand
- **Close** — click `×` to hide (reappears on page reload)

## CSV Export Format

| Column | Description |
|--------|-------------|
| `timestamp` | ISO 8601 timestamp |
| `model` | Model used (e.g., `gpt-5-6-thinking`) |
| `credits` | Credits consumed |
| `source` | Always `balance_delta` |
| `conversation_id` | ChatGPT conversation UUID |

## Technical Details

### Architecture

```
inject.js (MAIN world)     content.js (ISOLATED world)     popup.js
├── Fetch interceptor       ├── Widget UI                   ├── Stats dashboard
├── Balance API calls       ├── chrome.storage.local        └── CSV export
├── Model detection         └── postMessage listener
└── SPA navigation watch
```

- **`inject.js`** runs in `MAIN` world to monkey-patch `window.fetch` and intercept ChatGPT API calls
- **`content.js`** runs in `ISOLATED` world for Chrome extension API access (`chrome.storage.local`)
- Communication between worlds via `window.postMessage`

### Key Design Decisions

- **Balance delta, not token counting** — Exact credit charges, accounts for reasoning tokens, caching, etc.
- **Phantom prepare guard** — Ignores auto-triggered prepare calls during page load (within 5s)
- **Poll supersede** — Each prepare gets a unique poll ID; older polls auto-abort when a new message is sent
- **Local snapshot** — Poll compares against a frozen snapshot, not a mutable global, preventing race conditions
- **Passive interception** — Captures balance from ChatGPT's own API calls to stay in sync

### Permissions

- `storage` — Persist daily usage data locally
- `host_permissions: chatgpt.com` — Required for content scripts on ChatGPT

No data is sent to any external server. Everything stays in your browser.

## Limitations

- Only tracks messages sent **after** the extension is installed (no historical backfill)
- Daily data resets at midnight (local time)
- Requires an active ChatGPT session with valid authentication
- Balance API must be accessible (works with Plus, Team, and Enterprise plans)

## License

MIT
