# AR YouTube Live Chat — Even Realities G2

Streams your YouTube live chat to your **Even Realities G2 AR glasses** in real time. Messages appear one at a time on the lens display.

```
YouTube Live Chat  →  Express backend  →  Browser WebView  →  Even Hub bridge  →  G2 glasses
```

---

## How it works

- An **Express backend** polls the YouTube Live Chat API every ~3–5 s and broadcasts new messages over a Server-Sent Events (SSE) stream
- A **Vite web frontend** connects to the Even Hub bridge (injected by the Even Realities phone app) and receives messages from the backend
- Messages are queued and displayed on the glasses one at a time, every 5 s, with word-wrap for the G2's 576×288px display

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 18+ | `node --version` to check |
| Even Realities G2 glasses | Paired to your iPhone |
| Even Realities app on iPhone | Free — [evenrealities.com](https://evenrealities.com) |
| Even Hub developer account | Free — [hub.evenrealities.com](https://hub.evenrealities.com) |
| Google Cloud project | Free tier is fine |
| Active YouTube channel | Must be enabled for live streaming |

---

## Part 1 — Google Cloud setup (YouTube API)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create or select a project.

2. Enable the **YouTube Data API v3**:
   - Navigate to **APIs & Services → Library**
   - Search "YouTube Data API v3" → **Enable**

3. Create OAuth 2.0 credentials:
   - **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Desktop app**
   - Click **Create**, copy your **Client ID** and **Client Secret**

4. Add the redirect URI:
   - Edit your new credential
   - Under **Authorised redirect URIs**, add: `http://localhost:3001/callback`
   - **Save**

5. Configure the OAuth consent screen:
   - **APIs & Services → OAuth consent screen**
   - User type: **External**, fill in app name and your email
   - Add scope: `https://www.googleapis.com/auth/youtube.readonly`
   - Add your YouTube account as a **Test user**

---

## Part 2 — Even Hub setup (G2 app registration)

1. Sign in at [hub.evenrealities.com](https://hub.evenrealities.com).

2. Create a new app and set the **App URL** to where your frontend will be served:
   - **Development (same Wi-Fi):** `http://YOUR_LOCAL_IP:5173`
   - **Anywhere (recommended):** run `ngrok http 5173` and paste the `https://` URL

3. Save the app — you don't need an API key, Even Hub uses the URL directly.

> The Even Realities iPhone app will open your URL in an embedded WebView and inject the `EvenAppBridge` into the page, which your frontend uses to talk to the glasses.

---

## Part 3 — Local setup

### 1. Clone and install

```bash
git clone https://github.com/mattsmart2001-web/AR-Youtubechat.git
cd AR-Youtubechat
npm install
```

### 2. Configure credentials

```bash
cp .env.example .env
```

Fill in `.env`:

```env
YOUTUBE_CLIENT_ID=your_client_id_here
YOUTUBE_CLIENT_SECRET=your_client_secret_here
PORT=3001
```

### 3. Authorise YouTube (one time only)

```bash
npm run auth
```

Opens a browser window to sign in with your YouTube account. After approving, `.tokens.json` is saved locally — you won't need to do this again.

### 4. Start the app

```bash
npm run dev
```

This starts two processes concurrently:
- **Backend** on `http://localhost:3001` — polls YouTube and streams chat via SSE
- **Frontend** on `http://localhost:5173` — Vite dev server with Even Hub bridge

### 5. Enable the app on your glasses

- Open the Even Realities app on your iPhone
- Navigate to your registered app and open it
- The glasses should display **"YT Live Chat — Waiting for stream..."**

### 6. Go live

Start your YouTube live stream. Within ~10 s the glasses will show **"YT Live Chat — Live!"** and chat messages will begin appearing.

---

## Running in production

Build the frontend and serve everything from Express:

```bash
npm run build        # builds Vite frontend to dist/
NODE_ENV=production npm start   # Express serves dist/ + runs YouTube poller
```

Point your Even Hub app URL to `http://YOUR_SERVER:3001`.

To keep it running persistently:

```bash
npm install -g pm2
pm2 start "NODE_ENV=production npm start" --name ar-ytchat
pm2 save
```

---

## Project structure

```
server/
├── auth.ts      # One-time OAuth 2.0 flow — run via "npm run auth"
├── youtube.ts   # Discovers active broadcast and polls live chat
└── index.ts     # Express server — SSE endpoint + static serving
src/
├── index.html   # HTML entry point loaded by Even Realities WebView
└── main.ts      # Even Hub bridge + message queue + glasses display
vite.config.ts   # Dev server config — proxies /api to Express
tsconfig.json         # Frontend (browser / ESNext)
tsconfig.server.json  # Backend (Node.js / CommonJS)
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `No saved tokens found` | Run `npm run auth` first |
| `No active broadcast found` | Make sure your stream is **live** (not just scheduled). Retries every 30 s automatically. |
| Glasses show nothing | Check Even Realities app is open and your app URL is reachable from the phone |
| Bridge never connects | The `EvenAppBridge` is only injected in the Even Realities app WebView — it won't appear in a regular browser |
| `403 insufficient permissions` | Re-run `npm run auth` and ensure the `youtube.readonly` scope is granted |
| Messages delayed | Normal — YouTube enforces a minimum ~3–5 s poll interval |

---

## Tech stack

- **[`@evenrealities/even_hub_sdk`](https://www.npmjs.com/package/@evenrealities/even_hub_sdk)** — Even Hub bridge SDK for G2
- **[`googleapis`](https://www.npmjs.com/package/googleapis)** — YouTube Data API v3 client
- **[Express](https://expressjs.com)** — backend API + SSE stream
- **[Vite](https://vitejs.dev)** — frontend dev server and bundler
- **TypeScript / Node.js**
