/** 코인 정보 (meta에서 추출) */
export interface CoinInfo {
  name: string;
  index: number;
  szDecimals: number;
  maxLeverage: number;
}

/** 인스턴스 상태 */
export type InstanceStatus = 'idle' | 'connecting' | 'running' | 'error' | 'stopped';

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
  rateLimits: number;
}

/** 활동 로그 항목 */
export interface LogEntry {
  timestamp: string;
  instanceId: number;
  action: LogAction;
  result: 'success' | 'fail';
  detail?: string;
}

export type LogAction =
  | 'connect'
  | 'subscribe'
  | 'leverage'
  | 'order'
  | 'cancel'
  | 'error';

/** Private key 검증 정규식 */
export const PRIVATE_KEY_REGEX = /^0x[0-9a-fA-F]{64}$/;

/** 1분 단위 메트릭 스냅샷 */
export interface MinuteMetrics {
  /** 시작 시각 (예: "13:00") */
  startTime: string;
  /** 해당 1분 동안의 GET 요청 수 */
  getRequests: number;
  /** 해당 1분 동안의 POST 요청 수 */
  postRequests: number;
  /** 해당 1분 동안의 에러 수 */
  errors: number;
  /** 해당 1분 동안의 rate-limit 수 */
  rateLimits: number;
}
