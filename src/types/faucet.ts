/** Sub_Account 정보 */
export interface SubAccount {
  address: string;
  privateKey: string;
  createdAt: string;
}

/** Main_Account 정보 (private key는 메모리에만 보관) */
export interface MainAccountInfo {
  address: string;
  privateKey: string;
  usdcBalance: string;
  ethBalance: string;
}

/** 각 Sub_Account의 단계별 실행 상태 */
export type AccountStepStatusType = 'idle' | 'pending' | 'running' | 'success' | 'failed';

export interface AccountStepStatus {
  status: AccountStepStatusType;
  txHash?: string;
  error?: string;
  amount?: string;
}

/** 단계 실행 요약 */
export interface StepSummary {
  total: number;
  success: number;
  failed: number;
  totalAmount?: string;
}

/** 실행 단계 열거 */
export type FarmerStep =
  | 'transfer'
  | 'deposit'
  | 'depositCheck'
  | 'faucetClaim'
  | 'testnetRecover'
  | 'mainnetRecover';

/** Faucet Farmer 전체 상태 */
export interface FaucetFarmerState {
  subAccounts: SubAccount[];
  mainAccount: MainAccountInfo | null;
  currentStep: FarmerStep | null;
  stepStatuses: Record<FarmerStep, Map<string, AccountStepStatus>>;
  stepSummaries: Record<FarmerStep, StepSummary | null>;
}

/** Permit 서명 결과 */
export interface PermitSignature {
  r: string;
  s: string;
  v: number;
}

/** JSON 백업 파일 형식 */
export interface AccountBackup {
  version: 1;
  exportedAt: string;
  accounts: SubAccount[];
}
