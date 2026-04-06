import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type {
  SubAccount,
  AccountStepStatus,
  StepSummary,
  AccountBackup,
} from "@/types/faucet";
import { TRANSFER_AMOUNT_USD, USDC_DECIMALS } from "./constants";

const STORAGE_KEY = "faucet-farmer-sub-accounts";

/** Generate N sub-accounts using viem */
export function generateSubAccounts(count: number): SubAccount[] {
  const accounts: SubAccount[] = [];
  for (let i = 0; i < count; i++) {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    accounts.push({
      address: account.address,
      privateKey,
      createdAt: new Date().toISOString(),
    });
  }
  return accounts;
}

/** Save sub-accounts to localStorage */
export function saveToLocalStorage(accounts: SubAccount[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

/** Load sub-accounts from localStorage */
export function loadFromLocalStorage(): SubAccount[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as SubAccount[];
}

/** Serialize accounts to JSON backup string (AccountBackup format) */
export function exportToJson(accounts: SubAccount[]): string {
  const backup: AccountBackup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts,
  };
  return JSON.stringify(backup, null, 2);
}

/** Deserialize accounts from JSON backup string */
export function importFromJson(json: string): SubAccount[] {
  const backup = JSON.parse(json) as AccountBackup;
  return backup.accounts;
}

/** Download accounts as a JSON backup file via Blob + anchor click */
export function downloadBackup(accounts: SubAccount[]): void {
  const json = exportToJson(accounts);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `faucet-farmer-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Mask a private key: show first 6 chars + last 4 chars, mask the rest */
export function maskPrivateKey(privateKey: string): string {
  if (privateKey.length <= 10) return privateKey;
  const start = privateKey.slice(0, 6);
  const end = privateKey.slice(-4);
  const masked = "•".repeat(privateKey.length - 10);
  return `${start}${masked}${end}`;
}

/** Check if balance is sufficient for N accounts (N × TRANSFER_AMOUNT_USD in raw units) */
export function isBalanceSufficient(balance: bigint, n: number): boolean {
  // TRANSFER_AMOUNT_USD is 5.5, so in raw units: 5_500_000 per account
  const requiredPerAccount = BigInt(TRANSFER_AMOUNT_USD * 10 ** USDC_DECIMALS);
  const totalRequired = requiredPerAccount * BigInt(n);
  return balance >= totalRequired;
}

/** Compute step summary from a status map */
export function computeSummary(
  statuses: Map<string, AccountStepStatus>,
): StepSummary {
  let success = 0;
  let failed = 0;
  let totalAmountNum = 0;
  let hasAmount = false;

  for (const status of statuses.values()) {
    if (status.status === "success") success++;
    if (status.status === "failed") failed++;
    if (status.amount !== undefined) {
      hasAmount = true;
      totalAmountNum += parseFloat(status.amount);
    }
  }

  const summary: StepSummary = {
    total: statuses.size,
    success,
    failed,
  };

  if (hasAmount) {
    summary.totalAmount = totalAmountNum.toFixed(2);
  }

  return summary;
}

/** Get addresses of failed accounts from a status map */
export function getFailedAccounts(
  statuses: Map<string, AccountStepStatus>,
): string[] {
  const failed: string[] = [];
  for (const [address, status] of statuses.entries()) {
    if (status.status === "failed") {
      failed.push(address);
    }
  }
  return failed;
}

/** Get accounts where depositCheck status is 'success' */
export function getDepositReadyAccounts(
  accounts: SubAccount[],
  depositCheckStatuses: Map<string, AccountStepStatus>,
): SubAccount[] {
  return accounts.filter((account) => {
    const status = depositCheckStatuses.get(account.address);
    return status?.status === "success";
  });
}

/** Build faucet claim request body */
export function buildClaimBody(address: string): {
  type: string;
  user: string;
} {
  return { type: "claimDrip", user: address };
}
