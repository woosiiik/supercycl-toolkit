export interface ToolConfig {
  slug: string; // URL 경로
  name: string; // 메뉴 표시명
  description: string; // Tool_Page 상단 설명
  icon?: string; // 선택적 아이콘
}

export const tools: ToolConfig[] = [
  {
    slug: "hl-rate-limit-tester",
    name: "HL Rate-Limit Tester",
    description:
      "Hyperliquid API의 IP 기반 rate-limit(분당 weight 1200)이 실제로 어느 시점에 발동되는지 확인하는 도구입니다.\n" +
      "userFillsByTime API를 연속 호출하여 HTTP 429 응답이 돌아올 때까지 요청합니다.\n" +
      "429 응답 시 전체 응답 헤더, 응답 본문, 요청별 weight 누적량 등을 분석하여 보여줍니다.\n" +
      "Rate-limit 도달 후에는 자동으로 5초 간격 recovery probe를 실행하여 해제까지 걸리는 시간을 측정합니다.\n" +
      "참고: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits",
  },
  {
    slug: "hl-testnet-faucet-farmer",
    name: "HL Testnet Faucet Farmer",
    description:
      "Hyperliquid 테스트넷에서 USDC $100,000 이상을 확보하기 위한 자동화 도구입니다.\n" +
      "다수의 Arbitrum 계정을 생성하여 메인넷 deposit → 테스트넷 faucet claim → USDC 회수 절차를 자동화합니다.\n" +
      "⚠️ 이 도구는 브라우저에서 private key를 처리합니다. 신뢰할 수 있는 환경에서만 사용하세요.",
  },
  {
    slug: "hl-testnet-stress-tester",
    name: "HL Testnet Stress Tester",
    description:
      "Hyperliquid 테스트넷의 스트레스 내성을 확인하는 도구입니다.\n" +
      "N개의 독립 인스턴스를 생성하여 각각 WebSocket 구독, 레버리지 변경, limit order를 동시에 수행합니다.\n" +
      "WebSocket 연결 수, 채널 구독 수, GET/POST 요청 수 등 실시간 메트릭을 모니터링합니다.",
  },
  {
    slug: "jwe-decoder",
    name: "JWE Decoder",
    description:
      "JWE(JSON Web Encryption) Compact Serialization으로 암호화된 데이터를 RSA private key로 복호화합니다.\n" +
      "알고리즘: RSA-OAEP + A256GCM, RSA 2048bit PEM 또는 JWK 형식의 private key를 지원합니다.",
  },
  {
    slug: "postmessage-tester",
    name: "Youthmeta 연동 테스터",
    description:
      "Youthmeta 연동용 PostMessage 테스트 도구입니다.\n" +
      "Supercycl 웹사이트를 새 탭으로 열고 JWE 암호화된 사용자 데이터를 postMessage로 전송합니다.\n" +
      "RSA 공개키로 데이터를 JWE 암호화(RSA-OAEP-256 + A256GCM)한 후, 새 탭이 ready 신호를 보내면 전송합니다.\n" +
      "참고: https://icon-project.atlassian.net/wiki/spaces/SuperCycl/pages/4168024074/Design+-+UTM+Referral+Affiliate#Youthmeta-%ED%9A%8C%EC%9B%90-%EA%B0%80%EC%9E%85-%EB%B0%8F-%ED%9A%8C%EC%9B%90-%EC%A0%95%EB%B3%B4-%EC%88%98%EB%A0%B9",
  },
];
