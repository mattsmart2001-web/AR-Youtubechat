/**
 * AR YouTube Chat — main entry point
 *
 * Architecture:
 *   YouTube Live Chat API  →  YouTubeChatPoller  →  ChatTicker  →  G1 glasses
 *                                                       ↑
 *                                             MentraOS AppServer session
 *
 * Setup (once):
 *   1. cp .env.example .env  and fill in credentials
 *   2. npm run auth           to complete OAuth and save .tokens.json
 *   3. npm run dev            to start the server
 *   4. Open MentraOS on your phone → enable this app
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { AppServer, TpaSession } from '@mentra/sdk';
import {
  createOAuthClient,
  getActiveLiveChatId,
  YouTubeChatPoller,
} from './youtube';
import { ChatTicker } from './ticker';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const PACKAGE_NAME = process.env.MENTRAOS_PACKAGE_NAME ?? 'com.yourname.ytchat';
const API_KEY = process.env.MENTRAOS_API_KEY ?? '';
const RETRY_NO_BROADCAST_MS = 30_000;

class YTChatApp extends AppServer {
  private ticker = new ChatTicker();
  private poller: YouTubeChatPoller | null = null;

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: API_KEY,
      port: PORT,
    });
  }

  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`[App] Session connected  session=${sessionId}  user=${userId}`);

    this.ticker.setSession(session);
    session.layouts.showTextWall('YT Live Chat\nConnecting...', { durationMs: 3000 });

    if (!this.poller) {
      await this.startYouTubePoller(session);
    }
  }

  private async startYouTubePoller(session: TpaSession): Promise<void> {
    try {
      const auth = createOAuthClient();
      const liveChatId = await getActiveLiveChatId(auth);

      if (!liveChatId) {
        console.warn('[YouTube] No active broadcast found — retrying in 30 s');
        session.layouts.showTextWall('No active\nYT stream found.\nRetrying in 30 s', { durationMs: RETRY_NO_BROADCAST_MS });
        setTimeout(() => this.startYouTubePoller(session), RETRY_NO_BROADCAST_MS);
        return;
      }

      console.log(`[YouTube] Found broadcast  liveChatId=${liveChatId}`);
      session.layouts.showTextWall('YT Live Chat\nReady!', { durationMs: 3000 });

      this.poller = new YouTubeChatPoller(auth, liveChatId, (msg) => {
        this.ticker.push(msg);
      });

      await this.poller.start();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[App] YouTube poller error:', msg);
      session.layouts.showTextWall(`Error:\n${msg.slice(0, 80)}`, { durationMs: 8000 });
    }
  }
}

const app = new YTChatApp();

app.start()
  .then(() => {
    console.log(`[App] Server listening on port ${PORT}`);
    console.log(`[App] Package: ${PACKAGE_NAME}`);
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[App] Failed to start:', msg);
    process.exit(1);
  });
