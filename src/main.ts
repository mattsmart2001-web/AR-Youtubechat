import {
  waitForEvenAppBridge,
  TextContainerProperty,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk';

const CONTAINER_ID = 1;
const CONTAINER_NAME = 'yt-chat';
const DISPLAY_WIDTH = 576;
const DISPLAY_HEIGHT = 288;
const CHARS_PER_LINE = 46;
const MAX_LINES = 5;
const DISPLAY_DURATION_MS = 5000;
const MAX_QUEUE = 50;

interface ChatMessage { id: string; author: string; text: string; }
type StreamStatus = 'idle' | 'searching' | 'live' | 'error';

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

const STATUS_TEXT: Record<StreamStatus, string> = {
  idle:      'YT Live Chat\nWaiting for stream...',
  searching: 'YT Live Chat\nFinding broadcast...',
  live:      'YT Live Chat\nLive! Waiting for\nfirst message...',
  error:     'YT Live Chat\nBackend error.\nRetrying...',
};

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

  async function setDisplay(text: string): Promise<void> {
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: CONTAINER_ID,
        containerName: CONTAINER_NAME,
        contentOffset: 0,
        contentLength: 2000,
        content: text,
      }),
    );
  }

  const queue: ChatMessage[] = [];
  let ticking = false;

  function tick(): void {
    if (queue.length === 0) { ticking = false; return; }
    ticking = true;
    const msg = queue.shift()!;
    setDisplay(formatMessage(msg)).catch((err) => console.error('[Bridge] Display error:', err));
    setTimeout(tick, DISPLAY_DURATION_MS);
  }

  function enqueue(msg: ChatMessage): void {
    if (queue.length >= MAX_QUEUE) queue.shift();
    queue.push(msg);
    if (!ticking) tick();
  }

  function connectSSE(): void {
    const evtSource = new EventSource('/api/events');
    evtSource.onmessage = (e: MessageEvent<string>) => {
      let data: Record<string, unknown>;
      try { data = JSON.parse(e.data); } catch { return; }
      if (data['type'] === 'status') {
        const s = data['status'] as StreamStatus;
        if (!ticking) setDisplay(STATUS_TEXT[s] ?? STATUS_TEXT.idle).catch(console.error);
        return;
      }
      if (data['id'] && data['author'] && data['text']) {
        enqueue(data as unknown as ChatMessage);
      }
    };
    evtSource.onerror = () => {
      console.error('[SSE] Connection lost — retrying in 5 s');
      evtSource.close();
      if (!ticking) setDisplay('Connection lost.\nRetrying...').catch(console.error);
      setTimeout(connectSSE, 5000);
    };
  }

  connectSSE();
}

main().catch((err) => console.error('[App] Fatal error:', err));
