import type { StressMetrics } from '@/types/stress';

type MetricKey = keyof StressMetrics;

/** 모든 카운터 0으로 초기화된 StressMetrics 반환 */
export function createMetrics(): StressMetrics {
  return {
    wsConnections: 0,
    channelSubscriptions: 0,
    getRequests: 0,
    postRequests: 0,
    errors: 0,
    rateLimits: 0,
  };
}

/** 해당 키 값 +1, 나머지 불변, 새 객체 반환 */
export function incrementMetric(metrics: StressMetrics, key: MetricKey): StressMetrics {
  return { ...metrics, [key]: metrics[key] + 1 };
}

/** wsConnections/channelSubscriptions 키 값 -1, 새 객체 반환 */
export function decrementMetric(
  metrics: StressMetrics,
  key: 'wsConnections' | 'channelSubscriptions',
): StressMetrics {
  return { ...metrics, [key]: Math.max(0, metrics[key] - 1) };
}
