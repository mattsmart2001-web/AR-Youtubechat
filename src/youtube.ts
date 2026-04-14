import { google, youtube_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';

const TOKENS_PATH = path.join(__dirname, '..', '.tokens.json');
const MIN_POLL_INTERVAL_MS = 3000;

export interface ChatMessage {
  id: string;
  author: string;
  text: string;
  timestamp: Date;
}

/** Build an authenticated OAuth2 client from saved tokens. */
export function createOAuthClient(): OAuth2Client {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET in .env');
  }

  if (!fs.existsSync(TOKENS_PATH)) {
    throw new Error('No saved tokens found. Run "npm run auth" first.');
  }

  const client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:3001/callback');
  const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'));
  client.setCredentials(tokens);

  client.on('tokens', (refreshed) => {
    const current = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'));
    fs.writeFileSync(TOKENS_PATH, JSON.stringify({ ...current, ...refreshed }, null, 2));
  });

  return client;
}

/** Returns the liveChatId of the currently active broadcast, or null. */
export async function getActiveLiveChatId(auth: OAuth2Client): Promise<string | null> {
  const yt = google.youtube({ version: 'v3', auth });

  const res = await yt.liveBroadcasts.list({
    part: ['snippet'],
    broadcastStatus: 'active',
    broadcastType: 'all',
    maxResults: 1,
  });

  const items = res.data.items ?? [];
  if (items.length === 0) return null;

  return items[0].snippet?.liveChatId ?? null;
}

export class YouTubeChatPoller {
  private yt: youtube_v3.Youtube;
  private liveChatId: string;
  private pageToken: string | undefined;
  private pollIntervalMs: number = 5000;
  private onMessage: (msg: ChatMessage) => void;
  private timer: NodeJS.Timeout | null = null;
  private seenIds = new Set<string>();
  private active = false;

  constructor(
    auth: OAuth2Client,
    liveChatId: string,
    onMessage: (msg: ChatMessage) => void,
  ) {
    this.yt = google.youtube({ version: 'v3', auth });
    this.liveChatId = liveChatId;
    this.onMessage = onMessage;
  }

  async start(): Promise<void> {
    this.active = true;
    console.log(`[YouTube] Polling liveChatId: ${this.liveChatId}`);
    await this.fetch(true);
    this.scheduleNext();
  }

  stop(): void {
    this.active = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    if (!this.active) return;
    this.timer = setTimeout(async () => {
      await this.fetch(false);
      this.scheduleNext();
    }, this.pollIntervalMs);
  }

  private async fetch(seed: boolean): Promise<void> {
    try {
      const res = await this.yt.liveChatMessages.list({
        liveChatId: this.liveChatId,
        part: ['snippet', 'authorDetails'],
        pageToken: this.pageToken,
        maxResults: 200,
      });

      const data = res.data;
      this.pageToken = data.nextPageToken ?? undefined;
      this.pollIntervalMs = Math.max(
        data.pollingIntervalMillis ?? 5000,
        MIN_POLL_INTERVAL_MS,
      );

      for (const item of data.items ?? []) {
        const id = item.id;
        if (!id || this.seenIds.has(id)) continue;
        this.seenIds.add(id);

        if (seed) continue;

        const text = item.snippet?.displayMessage?.trim();
        const author = item.authorDetails?.displayName ?? 'Unknown';
        if (text) {
          this.onMessage({ id, author, text, timestamp: new Date() });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[YouTube] Poll error:', msg);
    }
  }
}
