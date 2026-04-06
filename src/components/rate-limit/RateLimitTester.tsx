"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  RequestLogEntry,
  TestSessionSummary,
  ApiResponse,
} from "@/types/hyperliquid";
import type { RecoveryProbeResult } from "@/lib/hyperliquid";
import { validateAddress } from "@/lib/validation";
import {
  createTestSummary,
  runTestSession,
  runRecoveryProbe,
} from "@/lib/hyperliquid";
import AddressInput from "./AddressInput";
import TestControls from "./TestControls";
import LiveStatus from "./LiveStatus";
import TestSummary from "./TestSummary";
import RequestLog from "./RequestLog";
import RecoveryStatus from "./RecoveryStatus";

export default function RateLimitTester() {
  const [status, setStatus] = useState<
    "idle" | "running" | "completed" | "stopped" | "recovering"
  >("idle");
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);
  const [logs, setLogs] = useState<RequestLogEntry[]>([]);
  const [summary, setSummary] = useState<TestSessionSummary | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [recoveryProbes, setRecoveryProbes] = useState<RecoveryProbeResult[]>(
    [],
  );

  const abortControllerRef = useRef<AbortController | null>(null);

  // Elapsed time ticker while running or recovering
  useEffect(() => {
    if ((status !== "running" && status !== "recovering") || startedAt === null)
      return;

    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startedAt);
    }, 100);

    return () => clearInterval(interval);
  }, [status, startedAt]);

  const handleAddressChange = useCallback((value: string) => {
    setAddress(value);
    setAddressError(validateAddress(value));
  }, []);

  const handleStart = useCallback(async () => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const now = Date.now();
    setStatus("running");
    setLogs([]);
    setSummary(null);
    setStartedAt(now);
    setElapsedTime(0);
    setRecoveryProbes([]);

    const collectedLogs: RequestLogEntry[] = [];

    try {
      for await (const entry of runTestSession(address, controller.signal)) {
        collectedLogs.push(entry);
        setLogs([...collectedLogs]);
      }
    } catch {
      // AbortError or unexpected
    }

    const lastLog = collectedLogs[collectedLogs.length - 1];
    let rateLimitResponse: ApiResponse | undefined;
    if (lastLog?.statusCode === 429) {
      const headers: Record<string, string> = lastLog.headers ?? {};
      if (lastLog.retryAfter != null && !headers["retry-after"]) {
        headers["retry-after"] = String(lastLog.retryAfter);
      }
      rateLimitResponse = {
        statusCode: 429,
        data: [],
        responseTimeMs: lastLog.responseTimeMs,
        headers,
        error: lastLog.error,
      };
    }

    let testSummary = createTestSummary(collectedLogs, now, rateLimitResponse);
    setSummary(testSummary);

    // 429 도달 시 자동으로 recovery probe 시작
    if (lastLog?.statusCode === 429 && !controller.signal.aborted) {
      setStatus("recovering");
      const probes: RecoveryProbeResult[] = [];

      try {
        for await (const probe of runRecoveryProbe(
          address,
          controller.signal,
          5000,
        )) {
          probes.push(probe);
          setRecoveryProbes([...probes]);

          if (probe.recovered) {
            testSummary = {
              ...testSummary,
              recoveryTimeMs: probe.elapsedSinceRateLimitMs,
              recoveryProbes: probe.attempt,
            };
            setSummary(testSummary);
            break;
          }
        }
      } catch {
        // AbortError
      }
    }

    setStatus(controller.signal.aborted ? "stopped" : "completed");
  }, [address]);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const isRunning = status === "running" || status === "recovering";
  const canStart = !isRunning && addressError === null && address.length > 0;

  const totalWeight = logs.reduce((sum, log) => sum + log.weight, 0);

  return (
    <div className="flex flex-col gap-6">
      <AddressInput
        value={address}
        onChange={handleAddressChange}
        error={addressError}
        disabled={isRunning}
      />

      <TestControls
        onStart={handleStart}
        onStop={handleStop}
        isRunning={isRunning}
        canStart={canStart}
      />

      {(status === "running" || status === "recovering") && (
        <LiveStatus
          requestCount={logs.length}
          totalWeight={totalWeight}
          elapsedTime={elapsedTime}
          weightLimit={1200}
        />
      )}

      {status === "recovering" && <RecoveryStatus probes={recoveryProbes} />}

      <TestSummary summary={summary} />

      {logs.length > 0 && <RequestLog logs={logs} />}
    </div>
  );
}
