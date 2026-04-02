"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  SubAccount,
  MainAccountInfo,
  AccountStepStatus,
  StepSummary,
  FarmerStep,
} from "@/types/faucet";
import {
  generateSubAccounts,
  saveToLocalStorage,
  loadFromLocalStorage,
  importFromJson,
  downloadBackup,
  computeSummary,
  getFailedAccounts,
  getDepositReadyAccounts,
} from "@/lib/faucet/account";
import { TRANSFER_AMOUNT_USD } from "@/lib/faucet/constants";
import { transferUsdc } from "@/lib/faucet/transfer";
import { depositWithPermit } from "@/lib/faucet/deposit";
import { getHyperliquidBalance } from "@/lib/faucet/balance";
import { claimFaucet, sendUsd } from "@/lib/faucet/faucet";
import SecurityWarning from "./SecurityWarning";
import SubAccountManager from "./SubAccountManager";
import MainAccountInput from "./MainAccountInput";
import StepPanel from "./StepPanel";
import AccountStatusTable from "./AccountStatusTable";

function createEmptyStatuses(): Record<FarmerStep, Map<string, AccountStepStatus>> {
  return {
    transfer: new Map(),
    deposit: new Map(),
    depositCheck: new Map(),
    faucetClaim: new Map(),
    testnetRecover: new Map(),
    mainnetRecover: new Map(),
  };
}

function createEmptySummaries(): Record<FarmerStep, StepSummary | null> {
  return {
    transfer: null,
    deposit: null,
    depositCheck: null,
    faucetClaim: null,
    testnetRecover: null,
    mainnetRecover: null,
  };
}

export default function FaucetFarmer() {
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [mainAccount, setMainAccount] = useState<MainAccountInfo | null>(null);
  const [currentStep, setCurrentStep] = useState<FarmerStep | null>(null);
  const [stepStatuses, setStepStatuses] = useState(createEmptyStatuses);
  const [stepSummaries, setStepSummaries] = useState(createEmptySummaries);

  // Load sub-accounts from localStorage on mount
  useEffect(() => {
    const loaded = loadFromLocalStorage();
    if (loaded.length > 0) {
      setSubAccounts(loaded);
    }
  }, []);

  // Helper to update a single step's status map
  const updateStepStatuses = useCallback(
    (step: FarmerStep, statuses: Map<string, AccountStepStatus>) => {
      setStepStatuses((prev) => ({ ...prev, [step]: statuses }));
    },
    [],
  );

  // Helper to update a single step's summary
  const updateStepSummary = useCallback(
    (step: FarmerStep, summary: StepSummary) => {
      setStepSummaries((prev) => ({ ...prev, [step]: summary }));
    },
    [],
  );

  // Generic step executor: runs handler sequentially for each account
  async function executeStep(
    step: FarmerStep,
    accounts: SubAccount[],
    handler: (
      account: SubAccount,
    ) => Promise<{
      success: boolean;
      txHash?: string;
      error?: string;
      amount?: string;
    }>,
  ) {
    setCurrentStep(step);
    const statusMap = new Map<string, AccountStepStatus>();

    // Initialize all as pending
    for (const acc of accounts) {
      statusMap.set(acc.address, { status: "pending" });
    }
    updateStepStatuses(step, new Map(statusMap));

    // Execute sequentially
    for (const acc of accounts) {
      statusMap.set(acc.address, { status: "running" });
      updateStepStatuses(step, new Map(statusMap));

      try {
        const result = await handler(acc);
        statusMap.set(acc.address, {
          status: result.success ? "success" : "failed",
          txHash: result.txHash,
          error: result.error,
          amount: result.amount,
        });
      } catch (err) {
        statusMap.set(acc.address, {
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
      updateStepStatuses(step, new Map(statusMap));
    }

    // Compute summary
    const summary = computeSummary(statusMap);
    updateStepSummary(step, summary);
    setCurrentStep(null);
  }

  // ── Step handlers ──

  function handleTransfer() {
    if (!mainAccount) return;
    executeStep("transfer", subAccounts, async (acc) => {
      const result = await transferUsdc(
        mainAccount.privateKey,
        acc.address,
        TRANSFER_AMOUNT_USD,
      );
      return { success: true, txHash: result.txHash };
    });
  }

  function handleDeposit() {
    executeStep("deposit", subAccounts, async (acc) => {
      const result = await depositWithPermit(acc.privateKey, acc.address);
      return { success: result.success, error: result.error };
    });
  }

  function handleDepositCheck() {
    executeStep("depositCheck", subAccounts, async (acc) => {
      const balance = await getHyperliquidBalance(acc.address, false);
      const balanceNum = parseFloat(balance);
      if (balanceNum > 0) {
        return { success: true, amount: balance };
      }
      return { success: false, error: "잔액 없음 (deposit 미완료)" };
    });
  }

  function handleFaucetClaim() {
    // Only claim for accounts that passed depositCheck
    const readyAccounts = getDepositReadyAccounts(
      subAccounts,
      stepStatuses.depositCheck,
    );
    if (readyAccounts.length === 0) return;

    executeStep("faucetClaim", readyAccounts, async (acc) => {
      const result = await claimFaucet(acc.address);
      return { success: result.success, error: result.error };
    });
  }

  function handleTestnetRecover() {
    if (!mainAccount) return;
    executeStep("testnetRecover", subAccounts, async (acc) => {
      const balance = await getHyperliquidBalance(acc.address, true);
      const balanceNum = parseFloat(balance);
      if (balanceNum <= 0) {
        return { success: false, error: "테스트넷 잔액 없음" };
      }
      const result = await sendUsd(
        acc.privateKey,
        mainAccount.address,
        balance,
        true,
      );
      return { success: result.success, error: result.error, amount: balance };
    });
  }

  function handleMainnetRecover() {
    if (!mainAccount) return;
    executeStep("mainnetRecover", subAccounts, async (acc) => {
      const balance = await getHyperliquidBalance(acc.address, false);
      const balanceNum = parseFloat(balance);
      if (balanceNum <= 0) {
        return { success: false, error: "메인넷 잔액 없음" };
      }
      const result = await sendUsd(
        acc.privateKey,
        mainAccount.address,
        balance,
        false,
      );
      return { success: result.success, error: result.error, amount: balance };
    });
  }

  // ── Retry handlers (failed accounts only) ──

  function handleRetry(step: FarmerStep) {
    const failedAddresses = getFailedAccounts(stepStatuses[step]);
    const failedAccounts = subAccounts.filter((a) =>
      failedAddresses.includes(a.address),
    );
    if (failedAccounts.length === 0) return;

    const handlerMap: Record<FarmerStep, () => void> = {
      transfer: () => {
        if (!mainAccount) return;
        executeStep("transfer", failedAccounts, async (acc) => {
          const result = await transferUsdc(
            mainAccount.privateKey,
            acc.address,
            TRANSFER_AMOUNT_USD,
          );
          return { success: true, txHash: result.txHash };
        });
      },
      deposit: () => {
        executeStep("deposit", failedAccounts, async (acc) => {
          const result = await depositWithPermit(acc.privateKey, acc.address);
          return { success: result.success, error: result.error };
        });
      },
      depositCheck: () => {
        executeStep("depositCheck", failedAccounts, async (acc) => {
          const balance = await getHyperliquidBalance(acc.address, false);
          const balanceNum = parseFloat(balance);
          if (balanceNum > 0) {
            return { success: true, amount: balance };
          }
          return { success: false, error: "잔액 없음 (deposit 미완료)" };
        });
      },
      faucetClaim: () => {
        executeStep("faucetClaim", failedAccounts, async (acc) => {
          const result = await claimFaucet(acc.address);
          return { success: result.success, error: result.error };
        });
      },
      testnetRecover: () => {
        if (!mainAccount) return;
        executeStep("testnetRecover", failedAccounts, async (acc) => {
          const balance = await getHyperliquidBalance(acc.address, true);
          const balanceNum = parseFloat(balance);
          if (balanceNum <= 0) {
            return { success: false, error: "테스트넷 잔액 없음" };
          }
          const result = await sendUsd(
            acc.privateKey,
            mainAccount.address,
            balance,
            true,
          );
          return {
            success: result.success,
            error: result.error,
            amount: balance,
          };
        });
      },
      mainnetRecover: () => {
        if (!mainAccount) return;
        executeStep("mainnetRecover", failedAccounts, async (acc) => {
          const balance = await getHyperliquidBalance(acc.address, false);
          const balanceNum = parseFloat(balance);
          if (balanceNum <= 0) {
            return { success: false, error: "메인넷 잔액 없음" };
          }
          const result = await sendUsd(
            acc.privateKey,
            mainAccount.address,
            balance,
            false,
          );
          return {
            success: result.success,
            error: result.error,
            amount: balance,
          };
        });
      },
    };

    handlerMap[step]();
  }

  // ── SubAccountManager callbacks ──

  function handleGenerate(count: number) {
    const newAccounts = generateSubAccounts(count);
    setSubAccounts(newAccounts);
    saveToLocalStorage(newAccounts);
    downloadBackup(newAccounts);
    // Reset all step states
    setStepStatuses(createEmptyStatuses());
    setStepSummaries(createEmptySummaries());
  }

  function handleRestore(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const restored = importFromJson(json);
        setSubAccounts(restored);
        saveToLocalStorage(restored);
        // Reset all step states
        setStepStatuses(createEmptyStatuses());
        setStepSummaries(createEmptySummaries());
      } catch {
        alert("잘못된 파일 형식입니다.");
      }
    };
    reader.readAsText(file);
  }

  function handleDownloadBackup() {
    downloadBackup(subAccounts);
  }

  function handleAccountSet(account: MainAccountInfo) {
    setMainAccount(account);
  }

  // ── Disable logic ──

  const hasAccounts = subAccounts.length > 0;
  const hasMainAccount = mainAccount !== null;
  const isStepRunning = currentStep !== null;

  // Step config: title, description, handler, needs mainAccount, showAmount
  const stepConfigs: Array<{
    step: FarmerStep;
    title: string;
    description: string;
    onExecute: () => void;
    needsMainAccount: boolean;
    showAmount: boolean;
  }> = [
    {
      step: "transfer",
      title: "1. USDC 전송 (Main → Sub)",
      description: `각 Sub Account로 ${TRANSFER_AMOUNT_USD} USDC를 순차 전송합니다.`,
      onExecute: handleTransfer,
      needsMainAccount: true,
      showAmount: false,
    },
    {
      step: "deposit",
      title: "2. 메인넷 Deposit",
      description:
        "각 Sub Account에서 DepositWithPermit으로 5 USDC를 Hyperliquid에 deposit합니다.",
      onExecute: handleDeposit,
      needsMainAccount: false,
      showAmount: false,
    },
    {
      step: "depositCheck",
      title: "3. Deposit 확인",
      description:
        "각 Sub Account의 Hyperliquid 메인넷 잔액을 조회하여 deposit 완료 여부를 확인합니다.",
      onExecute: handleDepositCheck,
      needsMainAccount: false,
      showAmount: true,
    },
    {
      step: "faucetClaim",
      title: "4. Faucet Claim",
      description:
        "Deposit 확인된 Sub Account에 대해 테스트넷 faucet claim을 수행합니다.",
      onExecute: handleFaucetClaim,
      needsMainAccount: false,
      showAmount: false,
    },
    {
      step: "testnetRecover",
      title: "5. 테스트넷 USDC 회수",
      description:
        "각 Sub Account의 테스트넷 USDC를 Main Account로 회수합니다.",
      onExecute: handleTestnetRecover,
      needsMainAccount: true,
      showAmount: true,
    },
    {
      step: "mainnetRecover",
      title: "6. 메인넷 USDC 회수",
      description:
        "각 Sub Account의 메인넷 USDC를 Main Account로 회수합니다.",
      onExecute: handleMainnetRecover,
      needsMainAccount: true,
      showAmount: true,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <SecurityWarning />

      <SubAccountManager
        accounts={subAccounts}
        onGenerate={handleGenerate}
        onRestore={handleRestore}
        onDownloadBackup={handleDownloadBackup}
      />

      <MainAccountInput
        onAccountSet={handleAccountSet}
        subAccountCount={subAccounts.length}
      />

      {stepConfigs.map(
        ({ step, title, description, onExecute, needsMainAccount, showAmount }) => {
          const isDisabled =
            !hasAccounts ||
            (needsMainAccount && !hasMainAccount) ||
            isStepRunning;

          return (
            <div key={step} className="flex flex-col gap-2">
              <StepPanel
                title={title}
                description={description}
                onExecute={onExecute}
                onRetry={() => handleRetry(step)}
                disabled={isDisabled}
                isRunning={currentStep === step}
                summary={stepSummaries[step] ?? undefined}
              />
              {stepStatuses[step].size > 0 && (
                <AccountStatusTable
                  accounts={
                    step === "faucetClaim"
                      ? getDepositReadyAccounts(
                          subAccounts,
                          stepStatuses.depositCheck,
                        )
                      : subAccounts
                  }
                  statuses={stepStatuses[step]}
                  showAmount={showAmount}
                />
              )}
            </div>
          );
        },
      )}
    </div>
  );
}
