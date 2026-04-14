# AR YouTube Live Chat — Even Realities G1

Streams your YouTube live chat to your **Even Realities G1 AR glasses** in real time. Messages appear one at a time as a scrolling ticker on the lens display.

```
YouTube Live Chat  →  Node.js server  →  MentraOS (phone)  →  G1 glasses
```

---

## How it works

- Polls the YouTube Live Chat API every ~3–5 s (rate limited by Google)
- New messages are queued and sent to the glasses one at a time, every 5 s
- Long messages are word-wrapped to fit the G1's ~40-character display width
- Automatically detects your active live broadcast — no manual config needed
- If no stream is live, it retries every 30 s and shows a status message on the glasses

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 18+ | `node --version` to check |
| Even Realities G1 glasses | Paired to your phone |
| MentraOS app on your phone | Free — [mentra.glass](https://mentra.glass) |
| Google Cloud project | Free tier is fine |
| Active YouTube channel | Must be enabled for live streaming |

---

## Part 1 — Google Cloud setup (YouTube API)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project (or use an existing one).

2. Enable the **YouTube Data API v3**:
   - Navigate to **APIs & Services → Library**
   - Search for "YouTube Data API v3" → click **Enable**

3. Create OAuth 2.0 credentials:
   - Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Desktop app**
   - Name it anything (e.g. "AR YouTube Chat")
   - Click **Create**

4. Copy your **Client ID** and **Client Secret** — you'll need these shortly.

5. Add the redirect URI:
   - Click your new credential to edit it
   - Under **Authorised redirect URIs**, add: `http://localhost:3001/callback`
   - Click **Save**

6. Configure the OAuth consent screen (if prompted):
   - **APIs & Services → OAuth consent screen**
   - User type: **External**
   - Fill in app name and your email
   - Add scope: `https://www.googleapis.com/auth/youtube.readonly`
   - Add your YouTube account email as a **Test user**

---

## Part 2 — MentraOS setup

1. Install the **MentraOS** app on your phone and pair it to your G1 glasses.

2. Go to [console.mentra.glass](https://console.mentra.glass) and sign in.

3. Create a new app:
   - Click **New App**
   - Choose a **Package Name** in reverse-domain format, e.g. `com.yourname.ytchat`
   - Set the server URL to your machine's address (see note below)
   - Save and copy your **API Key**

> **Server URL note:** MentraOS needs to reach your Node.js server over the network.
> - On the same Wi-Fi: use your local IP, e.g. `http://192.168.1.x:3000`
> - From anywhere: use [ngrok](https://ngrok.com) — run `ngrok http 3000` and paste the `https://` URL

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

Open `.env` and fill in all four values:

```env
YOUTUBE_CLIENT_ID=your_client_id_here
YOUTUBE_CLIENT_SECRET=your_client_secret_here
MENTRAOS_API_KEY=your_mentraos_api_key_here
MENTRAOS_PACKAGE_NAME=com.yourname.ytchat
```

### 3. Authorise YouTube (one time only)

```bash
npm run auth
```

This opens a browser window asking you to sign in with your YouTube account. After approving, a `.tokens.json` file is saved locally. You won't need to do this again unless you revoke access.

### 4. Start the server

```bash
npm run dev
```

You should see:

```
[App] Server listening on port 3000
[App] Package: com.yourname.ytchat
```

### 5. Enable the app on your glasses

- Open MentraOS on your phone
- Go to the App Store / My Apps section
- Find your app and enable it
- The glasses should display **"YT Live Chat — Connecting..."**

### 6. Go live

Start your YouTube live stream. Within ~10 s the glasses will show **"YT Live Chat — Ready!"** and chat messages will begin appearing.

---

## Running in production

To keep the server running persistently (e.g. on a home server or VPS):

```bash
# Build first
npm run build

# Run with pm2
npm install -g pm2
pm2 start dist/index.js --name ar-ytchat
pm2 save
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `No saved tokens found` | Run `npm run auth` first |
| `No active broadcast found` | Make sure your stream is **live** (not just scheduled). The app retries every 30 s. |
| Glasses show nothing | Check MentraOS is connected and your app is enabled |
| `403 insufficient permissions` | Re-run `npm run auth` and make sure `youtube.readonly` scope is granted |
| Messages are delayed | Normal — YouTube's API enforces a minimum poll interval (~3–5 s) |

---

## Project structure

```
src/
├── auth.ts      # One-time OAuth 2.0 flow — run via "npm run auth"
├── youtube.ts   # Discovers active broadcast and polls live chat
├── ticker.ts    # Message queue with word-wrap; drains to glasses display
└── index.ts     # MentraOS AppServer — ties everything together
```

---

## Tech stack

- **[`@mentra/sdk`](https://www.npmjs.com/package/@mentra/sdk)** — MentraOS SDK for Even Realities G1
- **[`googleapis`](https://www.npmjs.com/package/googleapis)** — YouTube Data API v3 client
- **TypeScript / Node.js**
