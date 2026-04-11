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
        ) : (
          <p className="text-gray-500">준비 중입니다.</p>
        )}
      </div>
    </div>
  );
}
