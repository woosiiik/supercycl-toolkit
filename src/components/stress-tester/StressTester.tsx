"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type {
  InstanceState,
  StressMetrics,
  LogEntry,
  MinuteMetrics,
} from "@/types/stress";
import { PRIVATE_KEY_REGEX } from "@/types/stress";
import { createSharedPublicClient, fetchCoinList } from "@/lib/stress/coins";
import {
  createMetrics,
  incrementMetric,
  decrementMetric,
} from "@/lib/stress/metrics";
import { StressInstance } from "@/lib/stress/instance";
import { MAX_LOG_ENTRIES } from "@/lib/stress/constants";
import StressConfig from "./StressConfig";
import MetricsDashboard from "./MetricsDashboard";
import InstanceStatusList from "./InstanceStatusList";
import ActivityLog from "./ActivityLog";
import type { PublicClient, HttpTransport } from "@nktkas/hyperliquid";

function getMinuteKey(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export default function StressTester() {
  const [instances, setInstances] = useState<InstanceState[]>([]);
  const [metrics, setMetrics] = useState<StressMetrics>(createMetrics());
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minuteHistory, setMinuteHistory] = useState<MinuteMetrics[]>([]);

  const instancesRef = useRef<StressInstance[]>([]);
  const publicClientRef = useRef<PublicClient<HttpTransport> | null>(null);
  const prevSnapshotRef = useRef<StressMetrics>(createMetrics());
  const prevMinuteRef = useRef<string>(getMinuteKey());

  // 1분 단위 스냅샷 체크 (1초마다)
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      const currentMinute = getMinuteKey();
      if (currentMinute !== prevMinuteRef.current) {
        const prevMinute = prevMinuteRef.current;
        prevMinuteRef.current = currentMinute;

        // 현재 metrics를 ref로 직접 읽어서 delta 계산
        setMetrics((currentMetrics) => {
          const prev = prevSnapshotRef.current;
          const snap: MinuteMetrics = {
            startTime: prevMinute,
            wsConnections: currentMetrics.wsConnections,
            getRequests: currentMetrics.getRequests - prev.getRequests,
            postRequests: currentMetrics.postRequests - prev.postRequests,
            errors: currentMetrics.errors - prev.errors,
            getRateLimits: currentMetrics.getRateLimits - prev.getRateLimits,
            postRateLimits: currentMetrics.postRateLimits - prev.postRateLimits,
            wsRateLimits: currentMetrics.wsRateLimits - prev.wsRateLimits,
          };
          prevSnapshotRef.current = { ...currentMetrics };
          // 별도 queueMicrotask로 history 업데이트 (batching 회피)
          queueMicrotask(() => {
            setMinuteHistory((h) => [...h, snap]);
          });
          return currentMetrics;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  const handleMetric = useCallback((key: string) => {
    setMetrics((prev) => {
      if (key.startsWith("-")) {
        const realKey = key.slice(1) as
          | "wsConnections"
          | "channelSubscriptions";
        return decrementMetric(prev, realKey);
      }
      return incrementMetric(prev, key as keyof StressMetrics);
    });
  }, []);

  const handleLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => {
      const next = [...prev, entry];
      if (next.length > MAX_LOG_ENTRIES) {
        return next.slice(next.length - MAX_LOG_ENTRIES);
      }
      return next;
    });
  }, []);

  const handleStateChange = useCallback((state: InstanceState) => {
    setInstances((prev) =>
      prev.map((inst) => (inst.id === state.id ? state : inst)),
    );
  }, []);

  const handleStart = useCallback(
    async (
      privateKey: string,
      instanceCount: number,
      walletAddress?: string,
      enableWs?: boolean,
    ) => {
      if (!PRIVATE_KEY_REGEX.test(privateKey)) {
        setError("유효한 private key를 입력해주세요");
        return;
      }

      setError(null);
      setMetrics(createMetrics());
      setLogs([]);
      setMinuteHistory([]);
      prevSnapshotRef.current = createMetrics();
      prevMinuteRef.current = getMinuteKey();

      if (!publicClientRef.current) {
        publicClientRef.current = createSharedPublicClient();
      }
      const publicClient = publicClientRef.current;

      let coins;
      try {
        coins = await fetchCoinList(publicClient);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "코인 목록 조회 실패";
        setError(`코인 목록 조회 실패: ${msg}`);
        return;
      }

      const newInstances: StressInstance[] = [];
      const initialStates: InstanceState[] = [];

      for (let i = 0; i < instanceCount; i++) {
        const instance = new StressInstance(
          i,
          privateKey,
          publicClient,
          coins,
          handleMetric,
          handleLog,
          handleStateChange,
          walletAddress,
          enableWs,
        );
        newInstances.push(instance);
        initialStates.push(instance.getState());
      }

      instancesRef.current = newInstances;
      setInstances(initialStates);
      setIsRunning(true);

      // 순차적으로 3초 간격으로 시작, 실패 시 5초 후 무한 재시도
      const startWithRetry = async (instance: StressInstance) => {
        while (!instance.getState().status.match(/running|stopped/)) {
          try {
            await instance.start();
            return;
          } catch {
            await new Promise((r) => setTimeout(r, 5000));
          }
        }
      };

      (async () => {
        for (const instance of newInstances) {
          startWithRetry(instance); // fire-and-forget — 각 인스턴스가 독립적으로 재시도
          await new Promise((r) => setTimeout(r, 3000));
        }
      })();
    },
    [handleMetric, handleLog, handleStateChange],
  );

  const handleStop = useCallback(async () => {
    const stoppingInstances = instancesRef.current;
    instancesRef.current = [];
    await Promise.all(stoppingInstances.map((inst) => inst.stop()));
    setIsRunning(false);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <StressConfig
        onStart={handleStart}
        onStop={handleStop}
        isRunning={isRunning}
        canStart={!isRunning}
      />

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <MetricsDashboard
        metrics={metrics}
        isRunning={isRunning}
        minuteHistory={minuteHistory}
      />
      <InstanceStatusList instances={instances} />
      <ActivityLog logs={logs} />
    </div>
  );
}
