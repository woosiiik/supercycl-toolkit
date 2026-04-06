import type {
  ApiResponse,
  RequestLogEntry,
  TestSessionSummary,
} from "@/types/hyperliquid";

const API_URL = "https://api.hyperliquid.xyz/info";

/**
 * Calculate the weight of a userFillsByTime request.
 * Base weight is 20, plus 1 for every 20 items returned.
 */
export function calculateWeight(itemCount: number): number {
  const baseWeight = 20;
  const additionalWeight = Math.floor(itemCount / 20);
  return baseWeight + additionalWeight;
}

/**
 * Call the Hyperliquid userFillsByTime API endpoint.
 */
export async function callUserFillsByTime(
  address: string,
  startTime: number,
  endTime: number,
  signal?: AbortSignal,
): Promise<ApiResponse> {
  const startMs = performance.now();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "userFillsByTime",
        user: address,
        startTime,
        endTime,
      }),
      signal,
    });

    const responseTimeMs = Math.round(performance.now() - startMs);

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    if (!response.ok) {
      let errorMessage: string | undefined;
      try {
        const text = await response.text();
        errorMessage = text || undefined;
      } catch {
        // ignore body read errors
      }

      return {
        statusCode: response.status,
        data: [],
        responseTimeMs,
        headers,
        error: errorMessage,
      };
    }

    const data = await response.json();

    return {
      statusCode: response.status,
      data: Array.isArray(data) ? data : [],
      responseTimeMs,
      headers,
    };
  } catch (err: unknown) {
    const responseTimeMs = Math.round(performance.now() - startMs);
    const message =
      err instanceof Error ? err.message : "Unknown network error";

    return {
      statusCode: 0,
      data: [],
      responseTimeMs,
      headers: {},
      error: message,
    };
  }
}

/**
 * Create a summary of a completed test session.
 */
export function createTestSummary(
  logs: RequestLogEntry[],
  startedAt: number,
  rateLimitResponse?: ApiResponse,
): TestSessionSummary {
  const totalRequests = logs.length;
  const totalWeight = logs.reduce((sum, log) => sum + log.weight, 0);
  const rateLimitReached = logs.some((log) => log.statusCode === 429);
  const elapsedTimeMs = Date.now() - startedAt;

  const summary: TestSessionSummary = {
    totalRequests,
    totalWeight,
    rateLimitReached,
    elapsedTimeMs,
  };

  if (rateLimitResponse) {
    const retryAfterRaw = rateLimitResponse.headers["retry-after"];
    if (retryAfterRaw) {
      const parsed = Number(retryAfterRaw);
      if (!isNaN(parsed)) {
        summary.retryAfter = parsed;
      }
    }
    if (rateLimitResponse.error) {
      summary.errorMessage = rateLimitResponse.error;
    }
    summary.rateLimitHeaders = rateLimitResponse.headers;
    summary.rateLimitBody = rateLimitResponse.error;
  }

  return summary;
}

/**
 * Recovery probe result yielded during rate-limit recovery polling.
 */
export interface RecoveryProbeResult {
  attempt: number;
  timestamp: string;
  statusCode: number;
  responseTimeMs: number;
  recovered: boolean;
  elapsedSinceRateLimitMs: number;
}

/**
 * After hitting 429, poll the API at a fixed interval until it returns 200.
 * Yields each probe attempt so the UI can show progress.
 */
export async function* runRecoveryProbe(
  address: string,
  signal: AbortSignal,
  intervalMs: number = 5000,
): AsyncGenerator<RecoveryProbeResult> {
  const rateLimitHitAt = Date.now();
  const endTime = Date.now();
  const startTime = endTime - 1000; // 최근 1초만 조회 (weight 최소화)
  let attempt = 0;

  while (!signal.aborted) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, intervalMs);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve(undefined);
        },
        { once: true },
      );
    });

    if (signal.aborted) return;

    attempt++;
    const response = await callUserFillsByTime(
      address,
      startTime,
      endTime,
      signal,
    );

    const result: RecoveryProbeResult = {
      attempt,
      timestamp: new Date().toISOString(),
      statusCode: response.statusCode,
      responseTimeMs: response.responseTimeMs,
      recovered: response.statusCode === 200,
      elapsedSinceRateLimitMs: Date.now() - rateLimitHitAt,
    };

    yield result;

    if (result.recovered) return;
  }
}

/**
 * Run a test session that continuously calls userFillsByTime until
 * a 429 rate-limit response is received or the signal is aborted.
 */
export async function* runTestSession(
  address: string,
  signal: AbortSignal,
): AsyncGenerator<RequestLogEntry> {
  const endTime = Date.now();
  const startTime = endTime - 180 * 24 * 60 * 60 * 1000; // 약 6개월
  let requestNumber = 1;

  while (!signal.aborted) {
    const response = await callUserFillsByTime(
      address,
      startTime,
      endTime,
      signal,
    );

    // Network error (statusCode 0 means fetch itself failed)
    if (response.statusCode === 0) {
      yield {
        requestNumber,
        timestamp: new Date().toISOString(),
        statusCode: 0,
        responseTimeMs: response.responseTimeMs,
        itemCount: 0,
        weight: 0,
        error: response.error,
      };
      return;
    }

    const itemCount = response.data.length;
    const weight = calculateWeight(itemCount);

    const entry: RequestLogEntry = {
      requestNumber,
      timestamp: new Date().toISOString(),
      statusCode: response.statusCode,
      responseTimeMs: response.responseTimeMs,
      itemCount,
      weight,
    };

    if (response.error) {
      entry.error = response.error;
    }

    // 429 응답 시 Retry-After 헤더 추출
    if (response.statusCode === 429) {
      const retryAfterRaw = response.headers["retry-after"];
      if (retryAfterRaw) {
        const parsed = Number(retryAfterRaw);
        if (!isNaN(parsed)) {
          entry.retryAfter = parsed;
        }
      }
      entry.headers = response.headers;
      entry.responseBody = response.error;
    }

    yield entry;

    // Stop on rate limit
    if (response.statusCode === 429) {
      return;
    }

    requestNumber++;
  }
}
