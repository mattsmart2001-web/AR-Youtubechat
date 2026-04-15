import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import express from 'express';
import { createOAuthClient, getActiveLiveChatId, YouTubeChatPoller, ChatMessage } from './youtube';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const RETRY_MS = 30_000;

const clients = new Set<express.Response>();
let poller: YouTubeChatPoller | null = null;
let streamStatus: 'idle' | 'searching' | 'live' | 'error' = 'idle';

function broadcast(msg: ChatMessage): void {
  const payload = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of clients) res.write(payload);
}

function broadcastStatus(s: typeof streamStatus): void {
  streamStatus = s;
  const payload = `data: ${JSON.stringify({ type: 'status', status: s })}\n\n`;
  for (const res of clients) res.write(payload);
}

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: 'status', status: streamStatus })}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
  clients.add(res);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', streamStatus, clients: clients.size });
});

if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, '..', 'dist');
  app.use(express.static(distDir));
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

async function startPoller(): Promise<void> {
  broadcastStatus('searching');
  try {
    const auth = createOAuthClient();
    const liveChatId = await getActiveLiveChatId(auth);
    if (!liveChatId) {
      console.warn('[YouTube] No active broadcast — retrying in 30 s');
      broadcastStatus('idle');
      setTimeout(startPoller, RETRY_MS);
      return;
    }
    console.log(`[YouTube] Found broadcast: ${liveChatId}`);
    broadcastStatus('live');
    poller = new YouTubeChatPoller(auth, liveChatId, (msg) => {
      console.log(`[YouTube] -> ${msg.author}: ${msg.text}`);
      broadcast(msg);
    });
    await poller.start();
  } catch (err: unknown) {
    console.error('[Server] Poller error:', err instanceof Error ? err.message : String(err));
    broadcastStatus('error');
    setTimeout(startPoller, RETRY_MS);
  }
}

app.listen(PORT, async () => {
  console.log(`[Server] API listening on http://localhost:${PORT}`);
  await startPoller();
});
