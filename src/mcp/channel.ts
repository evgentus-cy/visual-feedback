/**
 * Channel core — the testable pieces of the MCP server, with no top-level side effects
 * (no MCP connection, no port binding). server.ts wires these to a real MCP `Server`.
 *
 * - `handleBatch`: persist screenshots + an audit copy, then push a channel notification.
 * - `createRequestListener`: the 127.0.0.1 HTTP handler (Origin gate, CORS/PNA, GET /health for
 *   the overlay's connection indicator, byte-accurate body cap, sanitized errors).
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

export interface ChannelConfig {
  /** Absolute directory for screenshots + audit logs (default: <cwd>/.claude/feedback). */
  feedbackDir: string;
  /** Write screenshot PNGs to disk so the agent can read them. */
  persistShots: boolean;
  /** Keep a full markdown copy of every batch on disk. */
  persistAuditLog: boolean;
  /** Above this many chars the channel push is a summary + a file pointer (avoids context flooding). */
  contentCharLimit: number;
}

export interface BatchItem {
  id?: string;
  comment?: string;
  screenshot?: string;
}
export interface Batch {
  markdown?: string;
  route?: string;
  items?: BatchItem[];
}

export type Notify = (event: {
  content: string;
  meta: Record<string, string>;
}) => void | Promise<void>;

const SHOTS_SUBDIR = 'shots';
const LOG_SUBDIR = 'log';
const DEFAULT_MAX_BODY_BYTES = 25_000_000; // ~25MB — room for several screenshot dataURLs

/** Decode a PNG/JPEG data URL into bytes, or null if it isn't one. */
export function decodeImage(dataUrl: string): Buffer | null {
  const base64 = /^data:image\/(?:png|jpeg);base64,(.+)$/s.exec(dataUrl)?.[1];
  return base64 ? Buffer.from(base64, 'base64') : null;
}

interface Shot {
  /** The on-disk basename without extension (matches the `<id>.png` token in the markdown). */
  id: string;
  /** Absolute path to the written PNG. */
  path: string;
}

async function writeScreenshots(items: BatchItem[], dir: string): Promise<Shot[]> {
  const shots: Shot[] = [];
  if (!items.some((item) => typeof item.screenshot === 'string')) return shots;
  await mkdir(dir, { recursive: true });
  for (const item of items) {
    if (typeof item.screenshot !== 'string') continue;
    const bytes = decodeImage(item.screenshot);
    if (!bytes) continue;
    const safeId = typeof item.id === 'string' && /^[\w-]+$/.test(item.id) ? item.id : randomUUID();
    const abs = path.join(dir, `${safeId}.png`);
    await writeFile(abs, bytes);
    shots.push({ id: safeId, path: abs });
  }
  return shots;
}

/** Process one feedback batch: persist screenshots/audit, then push a channel notification. */
export async function handleBatch(
  body: string,
  notify: Notify,
  config: ChannelConfig,
): Promise<{ count: number; screenshots: number }> {
  const batch = JSON.parse(body) as Batch;
  const items = Array.isArray(batch.items) ? batch.items : [];
  const count = items.length;
  const route = typeof batch.route === 'string' ? batch.route : '';

  const shots = config.persistShots
    ? await writeScreenshots(items, path.join(config.feedbackDir, SHOTS_SUBDIR))
    : [];

  let content = typeof batch.markdown === 'string' ? batch.markdown : body;
  // buildMarkdown emits a `<id>.png` token on each item's screenshot line; rewrite each to its
  // absolute path so every item points at ITS OWN screenshot inline. Single pass over the ORIGINAL
  // markdown: a sequential per-shot replaceAll would re-scan the injected paths and cross-contaminate
  // when one id is a string-prefix of another. Tokens with no matching shot are left untouched;
  // shots with no matching token (e.g. the body fallback when no markdown is present) → orphan list.
  const byToken = new Map(shots.map((s) => [`${s.id}.png`, s.path]));
  const hit = new Set<string>();
  if (shots.length > 0) {
    content = content.replaceAll(/[\w-]+\.png/g, (match) => {
      const abs = byToken.get(match);
      if (abs === undefined) return match;
      hit.add(match);
      return abs;
    });
  }
  const orphans = shots.filter((s) => !hit.has(`${s.id}.png`)).map((s) => s.path);
  if (orphans.length > 0) {
    content += `\n## Screenshots (read these for visual context)\n${orphans.map((p) => `- ${p}`).join('\n')}\n`;
  }

  const oversized = content.length > config.contentCharLimit;
  let logPath: string | undefined;
  if (config.persistAuditLog || oversized) {
    const logDir = path.join(config.feedbackDir, LOG_SUBDIR);
    await mkdir(logDir, { recursive: true });
    logPath = path.join(logDir, `batch-${String(Date.now())}-${randomUUID().slice(0, 8)}.md`);
    await writeFile(logPath, content);
  }

  let channelContent = content;
  if (oversized && logPath) {
    const shotList =
      shots.length > 0 ? `Screenshots:\n${shots.map((s) => `- ${s.path}`).join('\n')}\n` : '';
    channelContent =
      `# UI feedback batch — ${String(count)} item(s), route ${route || '/'}\n` +
      `Large batch; full text saved at: ${logPath}\n${shotList}Read that file to act on every item.`;
  }

  const firstShot = shots[0];
  const meta: Record<string, string> =
    firstShot === undefined
      ? { route, count: String(count) }
      : { route, count: String(count), screenshot: firstShot.path };

  await notify({ content: channelContent, meta });
  return { count, screenshots: shots.length };
}

export interface RequestListenerOptions {
  notify: Notify;
  config: ChannelConfig;
  isOriginAllowed: (origin: string) => boolean;
  maxBodyBytes?: number;
}

/**
 * Build the (req, res) handler. A browser reliably sets `Origin` and JS can't forge it, so an
 * Origin allowlist blocks a malicious site from POSTing to our loopback port. A request with no
 * Origin (curl / local tooling) is allowed.
 */
export function createRequestListener(
  options: RequestListenerOptions,
): (req: IncomingMessage, res: ServerResponse) => void {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  return (req, res) => {
    const origin = req.headers.origin;
    const originAllowed = origin === undefined || options.isOriginAllowed(origin);

    if (origin !== undefined && options.isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(originAllowed ? 204 : 403).end();
      return;
    }
    if (!originAllowed) {
      res.writeHead(403).end('forbidden origin');
      return;
    }
    // Health probe for the overlay's connection indicator: a 200 here means a
    // VISUAL_FEEDBACK_CHANNEL=1 session owns the port, so feedback will land.
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, channel: true }));
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405).end('use POST');
      return;
    }

    let body = '';
    let bytes = 0;
    let aborted = false;
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes > maxBodyBytes) {
        aborted = true;
        res.writeHead(413).end('payload too large');
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (aborted) return;
      const requestId = randomUUID().slice(0, 8);
      void handleBatch(body, options.notify, options.config)
        .then((result) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, requestId, ...result }));
        })
        .catch((error: unknown) => {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              ok: false,
              requestId,
              error: error instanceof Error ? error.message : 'invalid request',
            }),
          );
        });
    });
  };
}
