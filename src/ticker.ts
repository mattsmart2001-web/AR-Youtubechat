import type { TpaSession } from '@mentra/sdk';
import type { ChatMessage } from './youtube';

const DISPLAY_DURATION_MS = 5000;
const GAP_MS = 300;
const MAX_QUEUE = 50;
const CHARS_PER_LINE = 40;
const MAX_LINES = 4;

function wordWrap(text: string): string {
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

  return lines.slice(0, MAX_LINES).join('\n');
}

function formatMessage(msg: ChatMessage): string {
  const author = msg.author.length > 20 ? `${msg.author.slice(0, 18)}..` : msg.author;
  return wordWrap(`${author}: ${msg.text}`);
}

export class ChatTicker {
  private queue: ChatMessage[] = [];
  private session: TpaSession | null = null;
  private ticking = false;

  setSession(session: TpaSession): void {
    this.session = session;
    if (!this.ticking && this.queue.length > 0) {
      this.tick();
    }
  }

  clearSession(): void {
    this.session = null;
  }

  push(msg: ChatMessage): void {
    if (this.queue.length >= MAX_QUEUE) {
      this.queue.shift();
    }
    this.queue.push(msg);
    console.log(`[Ticker] +1 queued (${this.queue.length} pending) — ${msg.author}: ${msg.text}`);

    if (!this.ticking && this.session) {
      this.tick();
    }
  }

  private tick(): void {
    if (!this.session || this.queue.length === 0) {
      this.ticking = false;
      return;
    }

    this.ticking = true;
    const msg = this.queue.shift()!;
    const text = formatMessage(msg);

    try {
      this.session.layouts.showTextWall(text, { durationMs: DISPLAY_DURATION_MS });
      console.log(`[Glasses] → ${msg.author}: ${msg.text}`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[Glasses] Display error:', errMsg);
    }

    setTimeout(() => this.tick(), DISPLAY_DURATION_MS + GAP_MS);
  }
}
