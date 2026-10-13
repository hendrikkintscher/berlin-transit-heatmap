import { beforeAll, describe, expect, it, vi } from 'vitest';

// The worker's modules post to their own scope.
vi.stubGlobal('self', { postMessage: () => {} });
let wt: typeof import('./worker-timetables');
beforeAll(async () => {
  wt = await import('./worker-timetables');
});

describe('timetable handed over by the start page', () => {
  const url = 'https://example.org/data/berlin/timetable-weekday-10.bin?v=1';

  it('is the download the worker uses, once', async () => {
    wt.expectPrefetch(url);
    const taken = wt.takePrefetch(url);
    wt.prefetched({
      type: 'prefetch',
      url,
      status: 200,
      contentType: 'application/octet-stream',
      length: '3',
      buf: new Uint8Array([1, 2, 3]).buffer,
    });
    const res = (await taken)!;
    expect(res.ok).toBe(true);
    expect(res.headers.get('content-length')).toBe('3');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);
    // A second load of the same file fetches it as usual.
    expect(await wt.takePrefetch(url)).toBeUndefined();
  });

  it('passes on a missing file, so the typical day stands in', async () => {
    wt.expectPrefetch(url);
    wt.prefetched({ type: 'prefetch', url, status: 404, contentType: 'text/html' });
    const res = (await wt.takePrefetch(url))!;
    expect(res.status).toBe(404);
  });

  it('leaves the worker to fetch the file when the download failed', async () => {
    wt.expectPrefetch(url);
    wt.prefetched({ type: 'prefetch', url });
    expect(await wt.takePrefetch(url)).toBeNull();
  });

  it('is not waited for when the start page did not download the file', async () => {
    expect(await wt.takePrefetch(`${url}x`)).toBeUndefined();
  });
});
