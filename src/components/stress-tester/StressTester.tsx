"use client";

import { useState, useRef, useCallback } from "react";
import type { InstanceState, StressMetrics, LogEntry } from "@/types/stress";
import { PRIVATE_KEY_REGEX } from "@/types/stress";
import { createSharedPublicClient, fetchCoinList } from "@/lib/stress/coins";
import { createMetrics, incrementMetric, decrementMetric } from "@/lib/stress/metrics";
import { StressInstance } from "@/lib/stress/instance";
import { MAX_LOG_ENTRIES } from "@/lib/stress/constants";
import StressConfig from "./StressConfig";
import MetricsDashboard from "./MetricsDashboard";
import InstanceStatusList from "./InstanceStatusList";
import ActivityLog from "./ActivityLog";
import type { PublicClient, HttpTransport } from "@nktkas/hyperliquid";

export default function StressTester() {
  const [instances, setInstances] = useState<InstanceState[]>([]);
  const [metrics, setMetrics] = useState<StressMetrics>(createMetrics());
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const instancesRef = useRef<StressInstance[]>([]);
  const publicClientRef = useRef<PublicClient<HttpTransport> | null>(null);

  const handleMetric = useCallback((key: string) => {
    setMetrics((prev) => {
      if (key.startsWith("-")) {
        const realKey = key.slice(1) as "wsConnections" | "channelSubscriptions";
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
    async (privateKey: string, instanceCount: number) => {
      if (!PRIVATE_KEY_REGEX.test(privateKey)) {
        setError("유효한 private key를 입력해주세요");
        return;
      }

      setError(null);
      setMetrics(createMetrics());
      setLogs([]);

      // Create shared PublicClient
      if (!publicClientRef.current) {
        publicClientRef.current = createSharedPublicClient();
      }
      const publicClient = publicClientRef.current;

      // Fetch coin list
      let coins;
      try {
        coins = await fetchCoinList(publicClient);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "코인 목록 조회 실패";
        setError(`코인 목록 조회 실패: ${msg}`);
        return;
      }

      // Create N StressInstance objects
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
        );
        newInstances.push(instance);
        initialStates.push(instance.getState());
      }

      instancesRef.current = newInstances;
      setInstances(initialStates);
      setIsRunning(true);

      // Start all instances
      for (const instance of newInstances) {
        instance.start();
      }
    },
    [handleMetric, handleLog, handleStateChange],
  );

  const handleStop = useCallback(async () => {
    const stoppingInstances = instancesRef.current;
    instancesRef.current = [];

    // Stop all instances
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

      <MetricsDashboard metrics={metrics} isRunning={isRunning} />
      <InstanceStatusList instances={instances} />
      <ActivityLog logs={logs} />
    </div>
  );
}
