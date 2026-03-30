import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateWeight,
  callUserFillsByTime,
  createTestSummary,
  runTestSession,
} from './hyperliquid';
import type { RequestLogEntry, ApiResponse } from '@/types/hyperliquid';

// ─── calculateWeight ───────────────────────────────────────────

describe('calculateWeight', () => {
  it('returns base weight 20 when itemCount is 0', () => {
    expect(calculateWeight(0)).toBe(20);
  });

  it('returns 20 for itemCount less than 20', () => {
    expect(calculateWeight(19)).toBe(20);
  });

  it('returns 21 for exactly 20 items', () => {
    expect(calculateWeight(20)).toBe(21);
  });

  it('returns 22 for 40 items', () => {
    expect(calculateWeight(40)).toBe(22);
  });

  it('returns 25 for 100 items', () => {
    expect(calculateWeight(100)).toBe(25);
  });
});

// ─── callUserFillsByTime ───────────────────────────────────────

describe('callUserFillsByTime', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends correct POST request and returns data on success', async () => {
    const mockData = [{ id: 1 }, { id: 2 }];
    const mockHeaders = new Headers({ 'content-type': 'application/json' });
    const mockResponse = {
      ok: true,
      status: 200,
      headers: mockHeaders,
      json: vi.fn().mockResolvedValue(mockData),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

    const result = await callUserFillsByTime(
      '0x1234567890abcdef1234567890abcdef12345678',
      1000,
      2000,
    );

    expect(fetch).toHaveBeenCalledWith(
      'https://api.hyperliquid.xyz/info',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'userFillsByTime',
          user: '0x1234567890abcdef1234567890abcdef12345678',
          startTime: 1000,
          endTime: 2000,
        }),
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(result.data).toEqual(mockData);
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it('returns error info for non-ok responses (e.g. 429)', async () => {
    const mockHeaders = new Headers({ 'retry-after': '60' });
    const mockResponse = {
      ok: false,
      status: 429,
      headers: mockHeaders,
      text: vi.fn().mockResolvedValue('Rate limit exceeded'),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

    const result = await callUserFillsByTime(
      '0x1234567890abcdef1234567890abcdef12345678',
      1000,
      2000,
    );

    expect(result.statusCode).toBe(429);
    expect(result.data).toEqual([]);
    expect(result.headers['retry-after']).toBe('60');
    expect(result.error).toBe('Rate limit exceeded');
  });

  it('returns statusCode 0 and error message on network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    const result = await callUserFillsByTime(
      '0x1234567890abcdef1234567890abcdef12345678',
      1000,
      2000,
    );

    expect(result.statusCode).toBe(0);
    expect(result.data).toEqual([]);
    expect(result.error).toBe('Network error');
  });
});

// ─── createTestSummary ─────────────────────────────────────────

describe('createTestSummary', () => {
  it('creates summary from logs', () => {
    const logs: RequestLogEntry[] = [
      { requestNumber: 1, timestamp: '', statusCode: 200, responseTimeMs: 50, itemCount: 10, weight: 20 },
      { requestNumber: 2, timestamp: '', statusCode: 200, responseTimeMs: 60, itemCount: 30, weight: 21 },
    ];
    const startedAt = Date.now() - 1000;

    const summary = createTestSummary(logs, startedAt);

    expect(summary.totalRequests).toBe(2);
    expect(summary.totalWeight).toBe(41);
    expect(summary.rateLimitReached).toBe(false);
    expect(summary.elapsedTimeMs).toBeGreaterThanOrEqual(1000);
    expect(summary.retryAfter).toBeUndefined();
    expect(summary.errorMessage).toBeUndefined();
  });

  it('detects rate limit reached when a log has statusCode 429', () => {
    const logs: RequestLogEntry[] = [
      { requestNumber: 1, timestamp: '', statusCode: 200, responseTimeMs: 50, itemCount: 0, weight: 20 },
      { requestNumber: 2, timestamp: '', statusCode: 429, responseTimeMs: 30, itemCount: 0, weight: 20 },
    ];

    const summary = createTestSummary(logs, Date.now());
    expect(summary.rateLimitReached).toBe(true);
  });

  it('extracts retryAfter and errorMessage from rateLimitResponse', () => {
    const logs: RequestLogEntry[] = [
      { requestNumber: 1, timestamp: '', statusCode: 429, responseTimeMs: 30, itemCount: 0, weight: 20 },
    ];
    const rateLimitResponse: ApiResponse = {
      statusCode: 429,
      data: [],
      responseTimeMs: 30,
      headers: { 'retry-after': '120' },
      error: 'Too many requests',
    };

    const summary = createTestSummary(logs, Date.now(), rateLimitResponse);

    expect(summary.retryAfter).toBe(120);
    expect(summary.errorMessage).toBe('Too many requests');
  });

  it('handles empty logs', () => {
    const summary = createTestSummary([], Date.now());
    expect(summary.totalRequests).toBe(0);
    expect(summary.totalWeight).toBe(0);
    expect(summary.rateLimitReached).toBe(false);
  });
});


// ─── runTestSession ────────────────────────────────────────────

describe('runTestSession', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('yields entries and stops on 429', async () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678';
    const controller = new AbortController();

    let callCount = 0;
    vi.mocked(fetch).mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => [{ id: callCount }],
        } as unknown as Response;
      }
      // 3rd call returns 429
      return {
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '60' }),
        text: async () => 'Rate limit exceeded',
      } as unknown as Response;
    });

    const entries: RequestLogEntry[] = [];
    for await (const entry of runTestSession(address, controller.signal)) {
      entries.push(entry);
    }

    expect(entries).toHaveLength(3);
    expect(entries[0].requestNumber).toBe(1);
    expect(entries[0].statusCode).toBe(200);
    expect(entries[1].requestNumber).toBe(2);
    expect(entries[2].requestNumber).toBe(3);
    expect(entries[2].statusCode).toBe(429);
  });

  it('stops when signal is aborted', async () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678';
    const controller = new AbortController();

    let callCount = 0;
    vi.mocked(fetch).mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        controller.abort();
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => [],
      } as unknown as Response;
    });

    const entries: RequestLogEntry[] = [];
    for await (const entry of runTestSession(address, controller.signal)) {
      entries.push(entry);
    }

    // Should get at most 2 entries (abort happens during 2nd call, loop checks signal before 3rd)
    expect(entries.length).toBeLessThanOrEqual(2);
  });

  it('yields error entry and stops on network failure', async () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678';
    const controller = new AbortController();

    vi.mocked(fetch).mockRejectedValue(new Error('Failed to fetch'));

    const entries: RequestLogEntry[] = [];
    for await (const entry of runTestSession(address, controller.signal)) {
      entries.push(entry);
    }

    expect(entries).toHaveLength(1);
    expect(entries[0].statusCode).toBe(0);
    expect(entries[0].error).toBe('Failed to fetch');
  });
});
