# Supercycl Toolkit

코인 선물거래 애그리게이터 Supercycl 개발에 필요한 테스트/유틸리티 도구 모음.

## 도구 목록

| 도구                     | 설명                                                           |
| ------------------------ | -------------------------------------------------------------- |
| HL Rate-Limit Tester     | Hyperliquid API rate-limit 임계값 테스트 및 recovery 시간 측정 |
| HL Testnet Faucet Farmer | 다수 계정으로 테스트넷 USDC 대량 확보 자동화                   |
| HL Testnet Stress Tester | N개 인스턴스로 테스트넷 WebSocket/REST 부하 테스트             |
| JWE Decoder              | JWE(RSA-OAEP + A256GCM) 암호문 복호화                          |

## 로컬 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

http://localhost:3000 에서 확인.

## 프로덕션 빌드

```bash
npm run build
npm start
```

## 새 도구 추가 방법

1. `docs/requirements.md`에 요구사항 추가 (섹션 번호 부여)
2. 내용이 복잡한 경우 `docs/design.md`에 설계 문서 작성
3. `src/config/tools.ts`의 `tools` 배열에 항목 추가
4. `src/app/tools/[slug]/page.tsx`에 slug 매핑 추가
5. 컴포넌트는 `src/components/{tool-name}/` 하위에 배치
6. 비즈니스 로직은 `src/lib/{tool-name}/` 하위에 배치

## 프로젝트 구조

```
src/
├── app/tools/[slug]/page.tsx   # 동적 라우트 (도구별 페이지)
├── config/tools.ts             # 도구 등록 설정
├── components/                 # UI 컴포넌트
│   ├── rate-limit/             # Rate-Limit Tester
│   ├── faucet-farmer/          # Faucet Farmer
│   ├── stress-tester/          # Stress Tester
│   └── jwe-decoder/            # JWE Decoder
├── lib/                        # 비즈니스 로직
│   ├── faucet/                 # Faucet Farmer 라이브러리
│   └── stress/                 # Stress Tester 라이브러리
├── types/                      # TypeScript 타입 정의
docs/
├── requirements.md             # 요구사항 문서 (모든 도구)
└── design.md                   # 설계 문서 (모든 도구)
```

## 기술 스택

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- @nktkas/hyperliquid (Hyperliquid SDK)
- viem (Arbitrum 체인 상호작용)
- jose (JWE 복호화)
