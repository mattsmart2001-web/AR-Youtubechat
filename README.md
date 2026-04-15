# AR YouTube Live Chat — Even Realities G2

Streams your YouTube live chat to your **Even Realities G2 AR glasses** in real time. Messages appear instantly as a rolling log on the lens display.

```
YouTube Live Chat  →  Express backend  →  Even Hub WebView  →  G2 glasses
```

---

## How it works

- An **Express backend** polls the YouTube Live Chat API every ~3–5 s and pushes new messages over Server-Sent Events (SSE)
- A **web frontend** (loaded by the Even Realities phone app) receives those messages and displays them on the G2 lenses via the Even Hub bridge
- Messages appear instantly as they arrive, filling the screen as a rolling log — oldest lines scroll off the top

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 18+ | `node --version` to check |
| Even Realities G2 glasses | Paired to your iPhone |
| Even Realities iPhone app | From the App Store |
| Even Hub account | Free — [hub.evenrealities.com](https://hub.evenrealities.com) |
| Google Cloud project | Free tier is sufficient |
| YouTube channel with live streaming enabled | |

---

## Part 1 — Google Cloud / YouTube API

### 1. Enable the YouTube Data API

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create or select a project
2. **APIs & Services → Library** → search **YouTube Data API v3** → **Enable**

### 2. Create OAuth 2.0 credentials

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. Application type: **Desktop app** (localhost redirect URIs are automatically allowed — no redirect URI to configure)
3. Click **Create** — copy the **Client ID** and **Client Secret**

### 3. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen → Edit App**
2. Step through to the **Scopes** page → **Add or remove scopes**
3. Search `youtube.readonly` → tick `https://www.googleapis.com/auth/youtube.readonly` → **Update**
4. On the **Test users** page, add your YouTube account email
5. Save and continue through to the end

> Your app stays in "Testing" mode permanently — that's fine since you're the only user.

---

## Part 2 — Even Realities G2 setup

This is a two-part process: build a `.ehpk` package on your computer, upload it to Even Hub, then open it on the glasses.

### Step 1 — Find your machine's local IP address

Your G2 (via the iPhone app) needs to reach the Express backend running on your computer. They must be on the **same Wi-Fi network**.

- **Mac:** `ipconfig getifaddr en0`
- **Windows:** `ipconfig` → look for IPv4 Address under your Wi-Fi adapter
- **Linux:** `ip addr show` → look for `inet` under your Wi-Fi interface

Note this IP — you'll need it in the next step (e.g. `192.168.1.42`).

> **Alternatively**, use [ngrok](https://ngrok.com) for a public HTTPS URL that works from any network: `ngrok http 3001` → copy the `https://` URL.

### Step 2 — Clone and configure

```bash
git clone https://github.com/mattsmart2001-web/AR-Youtubechat.git
cd AR-Youtubechat
npm install
cp .env.example .env
```

Open `.env` and fill in all values:

```env
YOUTUBE_CLIENT_ID=your_client_id_here
YOUTUBE_CLIENT_SECRET=your_client_secret_here
PORT=3001
VITE_BACKEND_URL=http://192.168.1.42:3001   # ← your IP from Step 1
```

### Step 3 — Update the network whitelist

Open `app.json` and set the whitelist to your backend URL:

```json
"whitelist": ["http://192.168.1.42:3001"]
```

### Step 4 — Build the package

```bash
npm run bundle
```

This runs `vite build` then `evenhub pack` and produces **`ar-ytchat.ehpk`** in your project folder.

### Step 5 — Upload to Even Hub

1. Go to [hub.evenrealities.com](https://hub.evenrealities.com) → sign in
2. **My projects → Upload package**
3. Drag and drop `ar-ytchat.ehpk` onto the dialog (or click **Select file**)
4. Your project will appear in **My projects**

### Step 6 — Open the app on your glasses

1. Make sure your G2 is powered on and connected to your iPhone via the Even Realities app
2. In the Even Realities app, navigate to your uploaded app
3. Tap to open it — it loads in a WebView and connects to your backend

> The glasses should display **"YT Live Chat — Waiting for stream..."**

### Step 7 — Start the backend and go live

On your computer:

```bash
npm run auth    # first time only — opens browser for YouTube sign-in
npm start       # starts the Express backend
```

Start your YouTube live stream. Within ~10 s the glasses will show **"YT Live Chat — Live!"** and chat messages will begin scrolling.

---

## Re-deploying after code changes

```bash
# Update VITE_BACKEND_URL in .env if your IP changed, then:
npm run bundle          # rebuilds → new ar-ytchat.ehpk
# Re-upload ar-ytchat.ehpk to hub.evenrealities.com
```

---

## Development (no glasses needed)

```bash
npm run auth        # first time only
npm run dev         # backend on :3001, Vite frontend on :5173
```

Open `http://localhost:3001/api/health` to confirm the backend is running and polling YouTube. The Even Hub bridge only exists inside the Even Realities phone app WebView, so the glasses display won't work in a regular browser — but all the backend logic can be tested this way.

---

## Project structure

```
server/
├── auth.ts       # One-time OAuth 2.0 flow — run via "npm run auth"
├── youtube.ts    # Discovers active broadcast and polls live chat
└── index.ts      # Express server — SSE stream + static serving
src/
├── index.html    # HTML entry point loaded by Even Realities WebView
└── main.ts       # Even Hub bridge + rolling message display
app.json          # Even Hub package manifest
vite.config.ts    # Dev server — proxies /api to Express
tsconfig.json          # Frontend (browser / ESNext)
tsconfig.server.json   # Backend (Node.js / CommonJS)
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `No saved tokens found` | Run `npm run auth` first |
| `No active broadcast found` | Make sure your stream is **live** (not just scheduled). Retries every 30 s automatically. |
| Glasses show nothing after opening app | Check the Even Realities app is open and `npm start` is running on your computer |
| `Connection lost. Retrying...` on glasses | Backend isn't reachable — verify your IP in `.env` and `app.json` whitelist matches your current network, or use ngrok |
| App not appearing in Even Realities app | Allow a minute after uploading; try refreshing the app list |
| `evenhub: command not found` | Run `npm install` — the CLI is a local devDependency |
| Messages delayed | Normal — YouTube enforces a ~3–5 s minimum poll interval |
| Text overflows or underlaps the display | Adjust `MAX_VISIBLE_LINES` in `src/main.ts` line 29 (currently 12) |
| `403 insufficient permissions` on auth | Re-run `npm run auth` and ensure the `youtube.readonly` scope is granted |

---

## Tech stack

- **[`@evenrealities/even_hub_sdk`](https://www.npmjs.com/package/@evenrealities/even_hub_sdk)** — Even Hub bridge SDK for G2
- **[`@evenrealities/evenhub-cli`](https://www.npmjs.com/package/@evenrealities/evenhub-cli)** — CLI to build `.ehpk` packages
- **[`googleapis`](https://www.npmjs.com/package/googleapis)** — YouTube Data API v3 client
- **[Express](https://expressjs.com)** — backend API + SSE stream
- **[Vite](https://vitejs.dev)** — frontend dev server and bundler
- **TypeScript / Node.js**
