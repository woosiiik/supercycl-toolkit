export interface ToolConfig {
  slug: string; // URL 경로
  name: string; // 메뉴 표시명
  description: string; // Tool_Page 상단 설명
  icon?: string; // 선택적 아이콘
  legacy?: boolean; // 기존(legacy) 메뉴 — 사이드바에서 구분선 아래로 분리
}

// === 신규 메뉴 (상단) ===
const newTools: ToolConfig[] = [
  {
    slug: "supercycl-user",
    name: "슈퍼사이클 유저관리",
    description:
      "유저 address를 입력하면 DB 내 해당 회원의 각종 정보를 테이블별로 조회하여 보여주는 관리 도구입니다.\n" +
      "address/main_address를 참조하는 모든 테이블을 런타임에 자동 탐색하고, ym_uid 기반 워치리스트까지 함께 조회합니다.\n" +
      "\"유저삭제 SQL 생성\" 버튼은 조회된 테이블 기준으로 DELETE 쿼리문을 만들어 출력합니다 — 앱이 직접 삭제하지 않으며, 개발자가 검토 후 직접 실행합니다.\n" +
      "Dev/Staging/Production 환경을 선택할 수 있으며, Production은 SQL 생성 전 모달로 한 번 더 확인합니다.\n" +
      "조회만 하므로 읽기 권한 계정이면 충분합니다. VPN 연결이 필요합니다.",
  },
  {
    slug: "exchange-pnl",
    name: "거래소 PNL 수집/검증",
    description:
      "7개 코인선물거래소(OKX·BingX·Bitget·Gate·Bybit·Binance·Hyperliquid)의 Futures PnL을 실제 API로 수집하여 검증하는 도구입니다.\n" +
      "거래소별 read-only API key(Hyperliquid는 지갑 주소)를 입력하면 포지션 히스토리/income/fills를 수집해 PnL을 가격손익·수수료·펀딩 컴포넌트로 분리 정규화합니다.\n" +
      "여러 거래소 합산 보기, 거래소별 보기, 원본 API 응답(raw) 보기를 제공하며 수수료/펀딩 토글로 net을 재계산합니다.\n" +
      "본격 개발 전 실제 데이터 형태 확인 및 설계 검토용입니다. API key와 수집 데이터는 브라우저 localStorage에만 저장됩니다.\n" +
      "설계 근거: docs/pnl/exchange-pnl-comparison.md",
  },
];

// === Legacy 메뉴 (기존) ===
const legacyTools: ToolConfig[] = [
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
    slug: "user-dashboard",
    name: "가입 현황",
    description:
      "Supercycl 프로덕션 DB의 사용자 통계를 시계열 차트로 보여주는 대시보드입니다.\n" +
      "총 가입자(t_user), YM 연동(t_partner_youthmeta_user), OKX 연동(t_exchange_account) 수를 추적합니다.\n" +
      "PC에서 sync 스크립트(scripts/sync-user-stats.ts)를 실행하면 10초 간격으로 Supabase에 데이터가 저장됩니다.\n" +
      "대시보드는 Supabase에서 데이터를 읽어 일/1시간/30분/10분 단위로 차트를 표시합니다.",
  },
  {
    slug: "user-signup-detail",
    name: "가입 현황 상세",
    description:
      "시간대별 신규 가입자 수를 막대 그래프로 보여주는 상세 대시보드입니다.\n" +
      "UTC 기준 최근 2일치 데이터를 1시간/10분/1분 단위로 표시합니다.\n" +
      "해당 시간에 가입이 없으면 0으로 표시됩니다.",
  },
  {
    slug: "user-export",
    name: "사용자 데이터 Export",
    description:
      "프로덕션 DB에서 사용자 데이터를 조회하여 테이블로 미리보기하고 CSV로 내보내는 도구입니다.\n" +
      "⚠️ localhost에서만 동작합니다 (VPN 연결 필요).",
  },
  {
    slug: "ym-signup-stats",
    name: "유스메타 가입 현황",
    description:
      "유스메타 일일/누적 가입자 수와 EX 연동 현황을 조회하여 CSV로 다운로드하는 도구입니다.\n" +
      "⚠️ localhost에서만 동작합니다 (PNL DB VPN 연결 필요).",
  },
  {
    slug: "okx-rebate",
    name: "OKX 리베이트 조회",
    description:
      "OKX 브로커 프로그램에서 받은 리베이트 리워드를 조회하는 도구입니다.\n" +
      "OKX API를 통해 리베이트 상세 CSV를 다운로드하고, PNL DB(t_trade_history)와 매핑하여 주소별 리베이트 현황을 분석합니다.\n" +
      "⚠️ localhost에서만 동작합니다 (PNL DB VPN 연결 필요).\n" +
      "⚠️ OKX API Rate Limit: CSV 생성 요청 1회/60분, 링크 조회 2회/분, CSV 생성 소요 최대 2시간. 한 번 다운로드하면 캐시되어 재호출 불필요.",
  },
  {
    slug: "aes-gcm-crypto",
    name: "AES-256-GCM 암복호화",
    description:
      "AES-256-GCM 암복호화 도구입니다.\n" +
      "키: 64자리 hex (256bit), IV: 12바이트 랜덤 생성, 출력: base64(IV + ciphertext + authTag).\n" +
      "브라우저 Web Crypto API로 동작하며 서버 전송 없음.",
  },
  {
    slug: "jasypt-crypto",
    name: "Jasypt 암복호화",
    description:
      "Jasypt(PBEWITHHMACSHA512ANDAES_256) 호환 암복호화 도구입니다.\n" +
      "Java jasypt-1.9.3과 동일한 알고리즘으로 동작하며, 브라우저에서 바로 실행됩니다 (서버 전송 없음).\n" +
      "PBKDF2(HMAC-SHA512, 1000회) + AES-256-CBC, RandomIvGenerator 방식.",
  },
  {
    slug: "symbol-mapping",
    name: "유스메타 심볼 매핑 관리",
    description:
      "유스메타-거래소 심볼 매핑(t_ym_symbol_mapping)을 조회/추가/수정/삭제하는 관리 도구입니다.\n" +
      "유스메타 심볼과 각 거래소(Bitget, Bybit, Gateio, Hyperliquid, OKX)의 심볼 매핑을 관리합니다.\n" +
      "⚠️ localhost에서만 동작합니다 (DB VPN 연결 필요).",
  },
  {
    slug: "push-tester",
    name: "유스메타 푸시 알림 테스터",
    description:
      "PWA Web Push 알림 테스트 도구입니다.\n" +
      "VAPID Public Key 조회 → Service Worker 등록 → Push 구독 → WAS를 통한 메시지 전송까지 전체 흐름을 테스트합니다.\n" +
      "로컬 WAS(localhost:8080)가 실행 중이어야 합니다.",
  },
  {
    slug: "ym-signal-tester",
    name: "유스메타 시그널 전송 테스트",
    description:
      "유스메타 시그널 전송 및 회원 정보 변경 테스트 도구입니다.\n" +
      "RSA-OAEP + A256GCM JWE 암호화를 적용하여 실시간/확정 시그널 전송, 회원 정보 업데이트(member/notify)를 테스트합니다.\n" +
      "보안상 Public Key는 하드코딩되어 있지 않으며, 모든 환경에서 직접 입력해야 합니다.",
  },
  {
    slug: "ym-signal-status",
    name: "유스메타 시그널 상태 조회",
    description:
      "유스메타 시그널의 현재 상태와 수신 이력을 조회하는 도구입니다.\n" +
      "Redis에서 현재 유효한 Premium/Smart 시그널을 조회하고, MySQL(t_ym_signal_history)에서 시그널 수신 이력을 확인합니다.\n" +
      "⚠️ Local/Dev 환경만 지원합니다. Redis 및 DB VPN 연결이 필요합니다.",
  },
  {
    slug: "ym-push-status",
    name: "유스메타 Push 수신 상태 조회",
    description:
      "특정 사용자(지갑 주소 또는 OKX UID)의 유스메타 시그널 Push 수신 조건을 종합 점검하는 도구입니다.\n" +
      "YM 회원 상태, 워치리스트, Push 구독, 알림 설정, 거래소 연동, 보유 포지션을 조회하여 미확정/확정/반대 포지션 시그널 수신 가능 여부를 판정합니다.\n" +
      "⚠️ Local/Dev 환경만 지원합니다. Redis 및 DB VPN 연결이 필요합니다.",
  },
  {
    slug: "ym-signal-detail",
    name: "유스메타 시그널 상세",
    description:
      "코인별 유스메타 시그널 이력을 캔들스틱 차트 위에 시각화하는 도구입니다.\n" +
      "Binance 캔들 데이터에 Premium/Smart/Canceled 시그널을 마커로 표시합니다.\n" +
      "⚠️ Local/Dev 환경만 지원합니다. DB VPN 연결이 필요합니다.",
  },
  {
    slug: "sync-payload-decrypt",
    name: "거래소 API-key 동기화 payload 복호화",
    description:
      "거래소 API-Key 동기화 구간에서 클라이언트가 public key로 암호화해 전송한 encryptedPayload를 server의 private key로 복호화하는 도구입니다.\n" +
      "RSA 하이브리드 방식: RSA-OAEP(SHA-256/MGF1-SHA-256)로 AES 키를 복호화한 뒤 AES-256-GCM(IV 16byte, tag 128bit)으로 데이터를 복호화합니다.\n" +
      "payload는 base64(JSON{encryptedKey, iv, authTag, data}) 형식이며, private.pem(PKCS#8)을 입력하면 됩니다.\n" +
      "브라우저 Web Crypto API로 동작하며 private key·payload는 서버로 전송되지 않습니다.",
  },
];

export const tools: ToolConfig[] = [
  ...newTools,
  ...legacyTools.map((t) => ({ ...t, legacy: true as const })),
];
