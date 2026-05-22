"use client";

import { useEffect, useRef } from "react";

interface Signal {
  position: string;
  signal_type: string;
  timestamp: number;
}

interface Props {
  symbol: string;
  signals: Signal[];
  interval: string;
}

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface MarkerData {
  time: number;
  position: "belowBar" | "aboveBar";
  color: string;
  shape: "arrowUp" | "arrowDown";
  text: string;
}

const KST_OFFSET = 9 * 3600;

function isLong(position: string): boolean {
  return position.startsWith("L");
}

function signalLabel(signalType: string, position: string): string {
  if (signalType === "CANCELED") return `${position} CANCEL`;
  if (signalType === "CONFIRMED_PREMIUM") return `${position} 확정`;
  if (signalType === "REALTIME_PREMIUM") return `${position} 미확정`;
  // CONFIRMED_SMART (LL, SS) 는 position만
  return position;
}

function buildMarkers(signals: Signal[], candles: CandleData[]): MarkerData[] {
  if (candles.length === 0 || signals.length === 0) return [];

  const candleTimes = candles.map((c) => c.time);
  const firstTime = candleTimes[0];
  const lastTime = candleTimes[candleTimes.length - 1];

  function snapToCandle(ts: number): number {
    let closest = candleTimes[0];
    let minDiff = Math.abs(ts - closest);
    for (const ct of candleTimes) {
      const diff = Math.abs(ts - ct);
      if (diff < minDiff) {
        minDiff = diff;
        closest = ct;
      }
    }
    return closest;
  }

  const markers: MarkerData[] = [];

  for (const sig of signals) {
    if (sig.timestamp < firstTime || sig.timestamp > lastTime + 3600) continue;
    const snapped = snapToCandle(sig.timestamp);

    const long = isLong(sig.position);
    const color =
      sig.signal_type === "CANCELED"
        ? "#9ca3af"
        : long
          ? "#22c55e"
          : "#ef4444";

    markers.push({
      time: snapped,
      position: long ? "belowBar" : "aboveBar",
      color,
      shape: long ? "arrowUp" : "arrowDown",
      text: signalLabel(sig.signal_type, sig.position),
    });
  }

  // 시간순 정렬 (같은 시간이면 원래 순서 유지)
  markers.sort((a, b) => a.time - b.time);
  return markers;
}

export default function SignalChart({ symbol, signals, interval }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);

  const binanceSymbol = symbol.toUpperCase();

  useEffect(() => {
    if (!containerRef.current) return;

    let cleanupResize: (() => void) | undefined;
    let cancelled = false;

    async function init() {
      const lc = await import("lightweight-charts");

      if (cancelled || !containerRef.current) return;

      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      // 컨테이너 내 기존 차트 요소 제거
      containerRef.current.innerHTML = "";

      // 캔들 데이터 가져오기
      let candles: CandleData[] = [];
      try {
        const res = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=300`,
        );
        const klines = await res.json();
        if (Array.isArray(klines)) {
          candles = klines.map((k: number[]) => ({
            time: Math.floor(k[0] / 1000) + KST_OFFSET,
            open: parseFloat(k[1] as unknown as string),
            high: parseFloat(k[2] as unknown as string),
            low: parseFloat(k[3] as unknown as string),
            close: parseFloat(k[4] as unknown as string),
          }));
        }
      } catch {
        return;
      }

      if (cancelled || !containerRef.current || candles.length === 0) return;

      const chart = lc.createChart(containerRef.current, {
        layout: {
          background: { type: lc.ColorType.Solid, color: "#ffffff" },
          textColor: "#374151",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "rgba(156, 163, 175, 0.15)" },
          horzLines: { color: "rgba(156, 163, 175, 0.15)" },
        },
        crosshair: { mode: lc.CrosshairMode.Normal },
        rightPriceScale: { borderColor: "rgba(156, 163, 175, 0.2)" },
        timeScale: {
          borderColor: "rgba(156, 163, 175, 0.2)",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 5,
        },
        width: containerRef.current.clientWidth,
        height: 400,
      });

      const series = chart.addSeries(lc.CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      series.setData(candles as any);

      const kstSignals = signals.map((s) => ({ ...s, timestamp: s.timestamp + KST_OFFSET }));
      const markers = buildMarkers(kstSignals, candles);
      if (markers.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lc.createSeriesMarkers(series, markers as any);
      }

      chart.timeScale().fitContent();
      chartRef.current = chart;

      const handleResize = () => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: containerRef.current.clientWidth,
          });
        }
      };
      window.addEventListener("resize", handleResize);
      cleanupResize = () => window.removeEventListener("resize", handleResize);
    }

    init();

    return () => {
      cancelled = true;
      cleanupResize?.();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [binanceSymbol, interval, signals]);

  return <div ref={containerRef} className="w-full h-[400px]" />;
}
