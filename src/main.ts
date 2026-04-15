/**
 * Even Realities G2 frontend — runs inside the Even Realities phone app WebView.
 *
 * Flow:
 *   1. Connect to the Even Hub bridge (injected by the phone app)
 *   2. Create the initial text container on the glasses
 *   3. Open an SSE connection to the Express backend
 *   4. Append each incoming message to a rolling display buffer — no delay
 */

import {
  waitForEvenAppBridge,
  TextContainerProperty,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk';

// ── Display constants ──────────────────────────────────────────────────────

const CONTAINER_ID = 1;
const CONTAINER_NAME = 'yt-chat';  // max 16 chars
const DISPLAY_WIDTH = 576;         // G2 full display width (px)
const DISPLAY_HEIGHT = 288;        // G2 full display height (px)
const CHARS_PER_LINE = 46;         // ~576px / ~12.5px per char at default font

// How many lines fit on screen — tune this if text overflows or underlaps.
// G2 is 288px tall; at ~21px/line with 4px padding ≈ 13 lines max.
const MAX_VISIBLE_LINES = 12;

// Debounce rapid message bursts so we don't flood the bridge (ms).
const FLUSH_DEBOUNCE_MS = 80;

// Backend URL — set VITE_BACKEND_URL in .env for production (packaged .ehpk).
// In dev, Vite proxies /api → localhost:3001 so the relative path works fine.
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined)
  ? `${import.meta.env.VITE_BACKEND_URL as string}/api/events`
  : '/api/events';

// ── Types ──────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  author: string;
  text: string;
}

type StreamStatus = 'idle' | 'searching' | 'live' | 'error';

// ── Helpers ────────────────────────────────────────────────────────────────

function wordWrap(text: string): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > CHARS_PER_LINE) {
      if (current) lines.push(current);
      current = word.slice(0, CHARS_PER_LINE);
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function formatMessage(msg: ChatMessage): string[] {
  const author = msg.author.length > 20 ? `${msg.author.slice(0, 18)}..` : msg.author;
  return wordWrap(`${author}: ${msg.text}`);
}

const STATUS_TEXT: Record<StreamStatus, string> = {
  idle:      'YT Live Chat\nWaiting for stream...',
  searching: 'YT Live Chat\nFinding broadcast...',
  live:      'YT Live Chat\nLive! Waiting for\nfirst message...',
  error:     'YT Live Chat\nBackend error.\nRetrying...',
};

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[Bridge] Waiting for Even App Bridge...');
  const bridge = await waitForEvenAppBridge();
  console.log('[Bridge] Connected');

  const container = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: DISPLAY_WIDTH,
    height: DISPLAY_HEIGHT,
    borderWidth: 0,
    borderColor: 0,
    paddingLength: 4,
    containerID: CONTAINER_ID,
    containerName: CONTAINER_NAME,
    content: STATUS_TEXT.idle,
    isEventCapture: 0,
  });

  await bridge.createStartUpPageContainer(1, [container]);
  console.log('[Bridge] Container created');

  // ── Rolling display buffer ───────────────────────────────────────────────

  const displayLines: string[] = [];
  let hasMessages = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  async function setDisplay(content: string): Promise<void> {
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: CONTAINER_ID,
        containerName: CONTAINER_NAME,
        contentOffset: 0,
        contentLength: 2000,
        content,
      }),
    );
  }

  function scheduleFlush(): void {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const content = hasMessages ? displayLines.join('\n') : STATUS_TEXT.idle;
      setDisplay(content).catch((err) => console.error('[Bridge] Display error:', err));
    }, FLUSH_DEBOUNCE_MS);
  }

  function addMessage(msg: ChatMessage): void {
    hasMessages = true;
    const newLines = formatMessage(msg);
    displayLines.push(...newLines);
    while (displayLines.length > MAX_VISIBLE_LINES) displayLines.shift();
    scheduleFlush();
  }

  function showStatus(s: StreamStatus): void {
    if (hasMessages) return;
    setDisplay(STATUS_TEXT[s]).catch(console.error);
  }

  // ── SSE connection to Express backend ────────────────────────────────────

  function connectSSE(): void {
    const evtSource = new EventSource(BACKEND_URL);

    evtSource.onmessage = (e: MessageEvent<string>) => {
      let data: Record<string, unknown>;
      try { data = JSON.parse(e.data); } catch { return; }

      if (data['type'] === 'status') {
        showStatus(data['status'] as StreamStatus);
        return;
      }
      if (data['id'] && data['author'] && data['text']) {
        addMessage(data as unknown as ChatMessage);
      }
    };

    evtSource.onerror = () => {
      console.error('[SSE] Connection lost — retrying in 5 s');
      evtSource.close();
      if (!hasMessages) setDisplay('Connection lost.\nRetrying...').catch(console.error);
      setTimeout(connectSSE, 5000);
    };
  }

  connectSSE();
}

main().catch((err) => console.error('[App] Fatal error:', err));
