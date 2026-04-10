/** 코인 정보 (meta에서 추출) */
export interface CoinInfo {
  name: string;
  index: number;
  szDecimals: number;
  maxLeverage: number;
}

/** 인스턴스 상태 */
export type InstanceStatus =
  | "idle"
  | "connecting"
  | "running"
  | "error"
  | "stopped";

export interface InstanceState {
  id: number;
  status: InstanceStatus;
  wsConnected: boolean;
  channelCount: number;
  errors: number;
  lastAction?: string;
}

/** 실시간 메트릭 */
export interface StressMetrics {
  wsConnections: number;
  channelSubscriptions: number;
  getRequests: number;
  postRequests: number;
  errors: number;
  wsErrors: number;
  publicErrors: number;
  privateErrors: number;
  getRateLimits: number;
  postRateLimits: number;
  wsRateLimits: number;
}

/** 활동 로그 항목 */
export interface LogEntry {
  timestamp: string;
  instanceId: number;
  action: LogAction;
  result: "success" | "fail";
  detail?: string;
}

export type LogAction =
  | "connect"
  | "subscribe"
  | "leverage"
  | "order"
  | "cancel"
  | "query"
  | "error";

/** Private key 검증 정규식 (0x 접두사 있거나 없거나) */
export const PRIVATE_KEY_REGEX = /^(0x)?[0-9a-fA-F]{64}$/;

/** 0x 접두사가 없으면 자동으로 추가 */
export function normalizePrivateKey(key: string): string {
  const trimmed = key.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return `0x${trimmed}`;
  return trimmed;
}

/** 1분 단위 메트릭 스냅샷 */
export interface MinuteMetrics {
  startTime: string;
  wsConnections: number;
  getRequests: number;
  postRequests: number;
  errors: number;
  wsErrors: number;
  publicErrors: number;
  privateErrors: number;
  getRateLimits: number;
  postRateLimits: number;
  wsRateLimits: number;
}
