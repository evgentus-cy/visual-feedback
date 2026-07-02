// @vitest-environment node
// (real HTTP round-trips against a local server — happy-dom fetch enforces same-origin)
import { mkdtemp, readdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRequestListener, handleBatch, type ChannelConfig, type Notify } from './channel.ts';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const noop: Notify = () => undefined;

async function tempConfig(over: Partial<ChannelConfig> = {}): Promise<ChannelConfig> {
  const dir = await mkdtemp(path.join(tmpdir(), 'vf-'));
  return {
    feedbackDir: dir,
    persistShots: true,
    persistAuditLog: true,
    contentCharLimit: 12_000,
    ...over,
  };
}

describe('handleBatch', () => {
  it('writes a screenshot + audit log and notifies with content + meta', async () => {
    const config = await tempConfig();
    const events: { content: string; meta: Record<string, string> }[] = [];
    const result = await handleBatch(
      JSON.stringify({
        markdown: '# batch\n- fix the CTA',
        route: '/pricing',
        items: [{ id: 'a1', comment: 'fix the CTA', screenshot: PNG }],
      }),
      (event) => {
        events.push(event);
      },
      config,
    );

    expect(result).toEqual({ count: 1, screenshots: 1 });
    const shotFiles = await readdir(path.join(config.feedbackDir, 'shots'));
    expect(shotFiles).toContain('a1.png');
    const logFiles = await readdir(path.join(config.feedbackDir, 'log'));
    expect(logFiles).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]?.meta['route']).toBe('/pricing');
    expect(events[0]?.meta['count']).toBe('1');
    expect(events[0]?.meta['screenshot']).toContain('a1.png');
    expect(events[0]?.content).toContain('Screenshots');
  });

  it("rewrites each item's <id>.png token to the absolute screenshot path inline", async () => {
    const config = await tempConfig();
    const events: { content: string; meta: Record<string, string> }[] = [];
    await handleBatch(
      JSON.stringify({
        markdown: '## 1. fix\n- screenshot: a1.png\n\n## 2. fix\n- screenshot: b2.png',
        route: '/',
        items: [
          { id: 'a1', screenshot: PNG },
          { id: 'b2', screenshot: PNG },
        ],
      }),
      (event) => {
        events.push(event);
      },
      config,
    );
    const content = events[0]?.content ?? '';
    const shotsDir = path.join(config.feedbackDir, 'shots');
    // Tokens replaced inline with the real absolute paths, each tied to its own item …
    expect(content).toContain(`- screenshot: ${path.join(shotsDir, 'a1.png')}`);
    expect(content).toContain(`- screenshot: ${path.join(shotsDir, 'b2.png')}`);
    // … and no orphaned batch-level "## Screenshots" list when everything mapped inline.
    expect(content).not.toContain('## Screenshots');
  });

  it('maps each shot to its own path even when one item id is a prefix of another', async () => {
    const config = await tempConfig();
    const events: { content: string; meta: Record<string, string> }[] = [];
    await handleBatch(
      JSON.stringify({
        markdown: '## 1. a\n- screenshot: 1.png\n\n## 2. b\n- screenshot: 11.png',
        route: '/',
        items: [
          { id: '1', screenshot: PNG },
          { id: '11', screenshot: PNG },
        ],
      }),
      (event) => {
        events.push(event);
      },
      config,
    );
    const content = events[0]?.content ?? '';
    const shotsDir = path.join(config.feedbackDir, 'shots');
    // The single-pass rewrite must not let `1.png` corrupt the `11.png` token.
    expect(content).toContain(`- screenshot: ${path.join(shotsDir, '1.png')}`);
    expect(content).toContain(`- screenshot: ${path.join(shotsDir, '11.png')}`);
    expect(content).not.toContain('## Screenshots');
  });

  it('skips disk writes when persistence is off', async () => {
    const config = await tempConfig({ persistShots: false, persistAuditLog: false });
    const events: unknown[] = [];
    const result = await handleBatch(
      JSON.stringify({ markdown: 'x', items: [{ id: 'b', screenshot: PNG }] }),
      (event) => {
        events.push(event);
      },
      config,
    );
    expect(result.screenshots).toBe(0);
    expect(events).toHaveLength(1);
  });
});

describe('createRequestListener (HTTP)', () => {
  let server: Server | undefined;

  afterEach(async () => {
    const current = server;
    server = undefined;
    if (current) {
      await new Promise<void>((resolve) => {
        current.close(() => {
          resolve();
        });
      });
    }
  });

  async function start(notify: Notify): Promise<string> {
    const config = await tempConfig({ persistShots: false, persistAuditLog: false });
    const listener = createRequestListener({
      notify,
      config,
      isOriginAllowed: (origin) => origin === 'http://localhost:3101',
    });
    const current = createServer(listener);
    server = current;
    await new Promise<void>((resolve) => {
      current.listen(0, '127.0.0.1', () => {
        resolve();
      });
    });
    const address = current.address();
    if (address === null || typeof address === 'string') throw new Error('no port assigned');
    return `http://127.0.0.1:${String(address.port)}`;
  }

  it('GET /health returns 200 {ok,channel}', async () => {
    const url = await start(noop);
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toMatchObject({ ok: true, channel: true });
  });

  it('POST a batch returns ok + requestId and notifies', async () => {
    const events: unknown[] = [];
    const url = await start((event) => {
      events.push(event);
    });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: 'm', route: '/', items: [{ id: 'x' }] }),
    });
    const json = (await res.json()) as { ok: boolean; count: number; requestId: string };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.count).toBe(1);
    expect(typeof json.requestId).toBe('string');
    expect(events).toHaveLength(1);
  });

  it('rejects a disallowed Origin with 403', async () => {
    const url = await start(noop);
    const res = await fetch(url, {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
      body: '{}',
    });
    expect(res.status).toBe(403);
  });

  it('returns 405 for a non-GET/POST method', async () => {
    const url = await start(noop);
    const res = await fetch(url, { method: 'PUT' });
    expect(res.status).toBe(405);
  });
});
