"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type {
  InstanceState,
  StressMetrics,
  LogEntry,
  MinuteMetrics,
} from "@/types/stress";
import { PRIVATE_KEY_REGEX, normalizePrivateKey } from "@/types/stress";
import { privateKeyToAccount } from "viem/accounts";
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
  const [accountAddress, setAccountAddress] = useState<string | undefined>();
  const [externalIp, setExternalIp] = useState<string>("조회 중...");

  const instancesRef = useRef<StressInstance[]>([]);
  const publicClientRef = useRef<PublicClient<HttpTransport> | null>(null);

  const OFFICE_IPS = ["61.74.181.34", "104.30.161.29"];

  const fetchExternalIp = async () => {
    try {
      const [ipv4, ipv6] = await Promise.all([
        fetch("https://api.ipify.org?format=text")
          .then((r) => r.text())
          .catch(() => null),
        fetch("https://api64.ipify.org?format=text")
          .then((r) => r.text())
          .catch(() => null),
      ]);
      const parts: string[] = [];
      if (ipv4) parts.push(`IPv4: ${ipv4}`);
      if (ipv6 && ipv6 !== ipv4) parts.push(`IPv6: ${ipv6}`);
      const isOffice = ipv4 ? OFFICE_IPS.includes(ipv4) : false;
      const label = isOffice ? " (사내망)" : "";
      setExternalIp(parts.length > 0 ? parts.join(" / ") + label : "조회 실패");
    } catch {
      setExternalIp("조회 실패");
    }
  };

  // 초기 IP 조회
  useEffect(() => {
    Promise.all([
      fetch("https://api.ipify.org?format=text")
        .then((r) => r.text())
        .catch(() => null),
      fetch("https://api64.ipify.org?format=text")
        .then((r) => r.text())
        .catch(() => null),
    ]).then(([v4, v6]) => {
      const p: string[] = [];
      if (v4) p.push(`IPv4: ${v4}`);
      if (v6 && v6 !== v4) p.push(`IPv6: ${v6}`);
      const isOffice = v4 ? OFFICE_IPS.includes(v4) : false;
      const label = isOffice ? " (사내망)" : "";
      setExternalIp(p.length > 0 ? p.join(" / ") + label : "조회 실패");
    });
  }, []);

  // 1분 단위 실시간 업데이트 (매 메트릭 변경 시 현재 분 행 업데이트)
  const currentMinuteRef = useRef<string>(getMinuteKey());
  const minuteStartMetricsRef = useRef<StressMetrics>(createMetrics());

  const updateMinuteHistory = useCallback((currentMetrics: StressMetrics) => {
    const now = getMinuteKey();

    if (now !== currentMinuteRef.current) {
      // 분이 바뀜 → 새 행 시작, 이전 스냅샷 갱신
      minuteStartMetricsRef.current = { ...currentMetrics };
      currentMinuteRef.current = now;
    }

    const start = minuteStartMetricsRef.current;
    const snap: MinuteMetrics = {
      startTime: currentMinuteRef.current,
      wsConnections: currentMetrics.wsConnections,
      getRequests: currentMetrics.getRequests - start.getRequests,
      postRequests: currentMetrics.postRequests - start.postRequests,
      errors: currentMetrics.errors - start.errors,
      wsErrors: currentMetrics.wsErrors - start.wsErrors,
      publicErrors: currentMetrics.publicErrors - start.publicErrors,
      privateErrors: currentMetrics.privateErrors - start.privateErrors,
      getRateLimits: currentMetrics.getRateLimits - start.getRateLimits,
      postRateLimits: currentMetrics.postRateLimits - start.postRateLimits,
      wsRateLimits: currentMetrics.wsRateLimits - start.wsRateLimits,
    };

    setMinuteHistory((h) => {
      if (h.length > 0 && h[h.length - 1].startTime === snap.startTime) {
        // 현재 분 행 업데이트
        return [...h.slice(0, -1), snap];
      }
      // 새 분 행 추가
      return [...h, snap];
    });
  }, []);

  const handleMetric = useCallback(
    (key: string) => {
      setMetrics((prev) => {
        let next: StressMetrics;
        if (key.startsWith("-")) {
          const realKey = key.slice(1) as
            | "wsConnections"
            | "channelSubscriptions";
          next = decrementMetric(prev, realKey);
        } else {
          next = incrementMetric(prev, key as keyof StressMetrics);
        }
        updateMinuteHistory(next);
        return next;
      });
    },
    [updateMinuteHistory],
  );

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

      // account address 도출
      const normalizedKey = normalizePrivateKey(privateKey);
      const account = privateKeyToAccount(normalizedKey as `0x${string}`);
      setAccountAddress(walletAddress ?? account.address);

      // IP 재조회
      fetchExternalIp();

      minuteStartMetricsRef.current = createMetrics();
      currentMinuteRef.current = getMinuteKey();

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

      // 순차적으로 3초 간격으로 시작, 실패 시 5~15초 랜덤 간격으로 무한 재시도
      const startWithRetry = async (instance: StressInstance) => {
        while (!instance.getState().status.match(/running|stopped/)) {
          try {
            await instance.start();
            return;
          } catch {
            // 5~15초 랜덤 대기 (동시 재시도 방지)
            const jitter = 5000 + Math.floor(Math.random() * 10000);
            await new Promise((r) => setTimeout(r, jitter));
          }
        }
      };

      (async () => {
        for (const instance of newInstances) {
          startWithRetry(instance); // fire-and-forget — 각 인스턴스가 독립적으로 재시도
          await new Promise((r) => setTimeout(r, 1000));
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
        accountAddress={accountAddress}
        externalIp={externalIp}
      />
      <InstanceStatusList instances={instances} />
      <ActivityLog logs={logs} />
    </div>
  );
}
