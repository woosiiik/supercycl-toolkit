export interface ToolConfig {
  slug: string;        // URL 경로
  name: string;        // 메뉴 표시명
  description: string; // Tool_Page 상단 설명
  icon?: string;       // 선택적 아이콘
}

export const tools: ToolConfig[] = [
  {
    slug: "hl-rate-limit-tester",
    name: "HL Rate-Limit Tester",
    description:
      "Hyperliquid API의 IP 기반 rate-limit(분당 weight 1200)이 실제로 어느 시점에 발동되는지 확인하는 도구입니다.\n" +
      "userFillsByTime API를 연속 호출하여 HTTP 429 응답이 돌아올 때까지 요청합니다.\n" +
      "429 응답 시 Retry-After 헤더 유무, 응답 본문의 에러 메시지, 요청별 weight 누적량 등을 분석하여 보여줍니다.\n" +
      "참고: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits",
  },
  // 새 도구 추가 시 여기에 항목 추가
];
