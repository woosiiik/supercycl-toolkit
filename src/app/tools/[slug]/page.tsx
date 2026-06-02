import { notFound } from "next/navigation";
import { tools } from "@/config/tools";
import ToolHeader from "@/components/ToolHeader";
import RateLimitTester from "@/components/rate-limit/RateLimitTester";
import FaucetFarmer from "@/components/faucet-farmer/FaucetFarmer";
import StressTester from "@/components/stress-tester/StressTester";
import JweDecoder from "@/components/jwe-decoder/JweDecoder";
import PostMessageTester from "@/components/postmessage-tester/PostMessageTester";
import HandoffTester from "@/components/handoff-tester/HandoffTester";
import UserDashboard from "@/components/user-dashboard/UserDashboard";
import UserSignupDetail from "@/components/user-dashboard/UserSignupDetail";
import UserExport from "@/components/user-export/UserExport";
import YmSignupStats from "@/components/ym-signup-stats/YmSignupStats";
import OkxRebate from "@/components/okx-rebate/OkxRebate";
import AesGcmCrypto from "@/components/jasypt-crypto/JasyptCrypto";
import JasyptCrypto from "@/components/jasypt-crypto/JasyptCryptoLegacy";
import PushTester from "@/components/push-tester/PushTester";
import SymbolMapping from "@/components/symbol-mapping/SymbolMapping";
import YmSignalTester from "@/components/ym-signal-tester/YmSignalTester";
import YmSignalStatus from "@/components/ym-signal-status/YmSignalStatus";
import YmPushStatus from "@/components/ym-push-status/YmPushStatus";
import YmSignalDetail from "@/components/ym-signal-detail/YmSignalDetail";
import SyncPayloadDecrypt from "@/components/sync-payload-decrypt/SyncPayloadDecrypt";

export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = tools.find((t) => t.slug === slug);

  if (!tool) {
    notFound();
  }

  return (
    <div>
      <ToolHeader tool={tool} />
      <div className="p-6">
        {slug === "hl-rate-limit-tester" ? (
          <RateLimitTester />
        ) : slug === "hl-testnet-faucet-farmer" ? (
          <FaucetFarmer />
        ) : slug === "hl-testnet-stress-tester" ? (
          <StressTester />
        ) : slug === "jwe-decoder" ? (
          <JweDecoder />
        ) : slug === "postmessage-tester" ? (
          <PostMessageTester />
        ) : slug === "handoff-tester" ? (
          <HandoffTester />
        ) : slug === "user-dashboard" ? (
          <UserDashboard />
        ) : slug === "user-signup-detail" ? (
          <UserSignupDetail />
        ) : slug === "user-export" ? (
          <UserExport />
        ) : slug === "ym-signup-stats" ? (
          <YmSignupStats />
        ) : slug === "okx-rebate" ? (
          <OkxRebate />
        ) : slug === "aes-gcm-crypto" ? (
          <AesGcmCrypto />
        ) : slug === "jasypt-crypto" ? (
          <JasyptCrypto />
        ) : slug === "symbol-mapping" ? (
          <SymbolMapping />
        ) : slug === "push-tester" ? (
          <PushTester />
        ) : slug === "ym-signal-tester" ? (
          <YmSignalTester />
        ) : slug === "ym-signal-status" ? (
          <YmSignalStatus />
        ) : slug === "ym-push-status" ? (
          <YmPushStatus />
        ) : slug === "ym-signal-detail" ? (
          <YmSignalDetail />
        ) : slug === "sync-payload-decrypt" ? (
          <SyncPayloadDecrypt />
        ) : (
          <p className="text-gray-500">준비 중입니다.</p>
        )}
      </div>
    </div>
  );
}
