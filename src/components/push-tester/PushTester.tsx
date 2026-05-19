"use client";

import { useState, useRef } from "react";

interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

const btnCls =
  "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700";

const TEST_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJHYXRlaW8iOiIxMjQxODE5OSIsIkh5cGVybGlxdWlkIjoiMHgzYjVlNzlhMDVlN2U0YjFhOGQ3YmNmMTUzZWVhYWJkNTIwZDViN2JhIiwidmVyc2lvbiI6InRlc3QiLCJPS1giOiI2NDQ3OTQ2MTg0NTQxNTMzNTIiLCJtYXN0ZXIiOiIweDNiNWU3OWEwNWU3ZTRiMWE4ZDdiY2YxNTNlZWFhYmQ1MjBkNWI3YmEiLCJleHAiOjE4MDcwODg5MTJ9.rI0tVHzIIZIs_Ots6t03xZEiPQUO8lKGLRjA9pDs5U4";

const WAS_ENVS: { label: string; url: string; defaultJwt: string }[] = [
  { label: "Local", url: "http://localhost:8080", defaultJwt: TEST_JWT },
  { label: "Dev", url: "https://pnl-dev.supercycl.io", defaultJwt: TEST_JWT },
  { label: "Staging", url: "https://pnl-stg.supercycl.io", defaultJwt: "" },
  { label: "Production", url: "https://pnl.supercycl.io", defaultJwt: "" },
];

export default function PushTester() {
  const [wasUrl, setWasUrl] = useState("http://localhost:8080");
  const [vapidPublicKey, setVapidPublicKey] = useState("");
  const [jwt, setJwt] = useState(TEST_JWT);
  const [subscription, setSubscription] = useState<PushSubscriptionJSON | null>(
    null,
  );
  const [bound, setBound] = useState(false);
  const [title, setTitle] = useState("Supercycl");
  const [body, setBody] = useState("테스트 푸시 메시지입니다.");
  const [url, setUrl] = useState("/dashboard");
  const [logs, setLogs] = useState<string[]>([]);
  const [swRegistered, setSwRegistered] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  function log(msg: string) {
    setLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] ${msg}`,
      ...prev,
    ]);
  }

  // Step 1: VAPID Public Key 가져오기
  async function fetchVapidKey() {
    try {
      const res = await fetch(`${wasUrl}/v1/push/pwa/vapid-public-key`);
      const data = await res.json();
      if (data.retCode === 0) {
        setVapidPublicKey(data.result.publicKey);
        log(`✅ VAPID Public Key 조회 성공: ${data.result.publicKey.substring(0, 30)}...`);
      } else {
        log(`❌ VAPID Key 조회 실패: retCode=${data.retCode}`);
      }
    } catch (e) {
      log(`❌ VAPID Key 조회 에러: ${e}`);
    }
  }

  // Step 2: Service Worker 등록 + Push 구독
  async function subscribePush() {
    if (!vapidPublicKey) {
      log("❌ VAPID Public Key를 먼저 가져오세요");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register("/push-sw.js");
      registrationRef.current = registration;
      setSwRegistered(true);
      log("✅ Service Worker 등록 완료");

      await navigator.serviceWorker.ready;

      // 기존 구독이 있으면 해제 (VAPID key가 다를 수 있음)
      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) {
        await existingSub.unsubscribe();
        log("ℹ️ 기존 구독 해제 후 재구독");
      }

      const applicationServerKey = base64ToUint8Array(vapidPublicKey);

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });

      const subJson = sub.toJSON() as PushSubscriptionJSON;
      setSubscription(subJson);

      log(`✅ Push 구독 성공`);
      log(`  endpoint: ${subJson.endpoint.substring(0, 60)}...`);
      log(`  p256dh: ${subJson.keys.p256dh.substring(0, 30)}...`);
      log(`  auth: ${subJson.keys.auth}`);

      // WAS에 subscribe 호출 (인증 불필요)
      const wasRes = await fetch(`${wasUrl}/v1/push/pwa/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        }),
      });
      const wasData = await wasRes.json();
      log(`✅ WAS subscribe: retCode=${wasData.retCode}`);
    } catch (e) {
      log(`❌ 구독 에러: ${e}`);
    }
  }

  // Step 3: Bind (디바이스에 계정 바인딩)
  async function bindPush() {
    if (!subscription) {
      log("❌ 먼저 Push 구독을 하세요");
      return;
    }
    if (!jwt) {
      log("❌ JWT를 입력하세요");
      return;
    }

    try {
      const res = await fetch(`${wasUrl}/v1/push/pwa/bind`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      const data = await res.json();
      if (data.retCode === 0) {
        setBound(true);
        log(`✅ Bind 성공!`);
      } else {
        log(`❌ Bind 실패: retCode=${data.retCode}, ${data.retMsg || ""}`);
      }
    } catch (e) {
      log(`❌ Bind 에러: ${e}`);
    }
  }

  // Step 4: WAS를 통해 Push 메시지 전송
  async function sendPush() {
    if (!jwt) {
      log("❌ JWT를 입력하세요");
      return;
    }

    try {
      const res = await fetch(`${wasUrl}/v1/push/pwa/send-test`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, body, url }),
      });
      const data = await res.json();
      if (data.retCode === 0) {
        log(`✅ Push 전송 성공! sent=${data.result?.sent}, failed=${data.result?.failed}`);
      } else {
        log(`❌ Push 전송 실패: retCode=${data.retCode}, ${data.retMsg || ""}`);
      }
    } catch (e) {
      log(`❌ Push 전송 에러: ${e}`);
    }
  }

  // Step 5: 구독 해제
  async function unsubscribePush() {
    if (!subscription) {
      log("❌ 구독 정보가 없습니다");
      return;
    }

    try {
      // WAS에 unsubscribe (인증 불필요)
      const wasRes = await fetch(`${wasUrl}/v1/push/pwa/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      const wasData = await wasRes.json();
      log(`✅ WAS unsubscribe: retCode=${wasData.retCode}`);

      // 브라우저 구독 해제
      if (registrationRef.current) {
        const sub = await registrationRef.current.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      }

      setSubscription(null);
      setBound(false);
      log("✅ 브라우저 Push 구독 해제 완료");
    } catch (e) {
      log(`❌ 구독 해제 에러: ${e}`);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* WAS 환경 + JWT */}
      <Section title="WAS 설정">
        <label className="block text-sm text-zinc-500 mb-1">환경</label>
        <div className="flex gap-2">
          {WAS_ENVS.map((env) => (
            <button
              key={env.label}
              onClick={() => { setWasUrl(env.url); setJwt(env.defaultJwt); }}
              className={`px-3 py-1.5 text-sm rounded-md border ${
                wasUrl === env.url
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-white border-zinc-300 text-zinc-500 hover:border-zinc-400"
              }`}
            >
              {env.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-zinc-500 font-mono">{wasUrl}</p>
        <label className="block text-sm text-zinc-500 mt-3 mb-1">
          JWT Token (Bind, Send-Test에 필요)
        </label>
        <input
          className="w-full p-2 bg-white border border-zinc-300 rounded text-zinc-900 font-mono text-sm"
          value={jwt}
          onChange={(e) => setJwt(e.target.value)}
          placeholder="eyJhbGciOiJIUzI1NiIs..."
        />
        {jwt && parseJwtMaster(jwt) && (
          <p className="mt-1 text-xs text-zinc-500">
            master: <span className="text-green-600 font-mono">{parseJwtMaster(jwt)}</span>
          </p>
        )}
      </Section>

      {/* Step 1 */}
      <Section title="Step 1. VAPID Key 가져오기">
        <button onClick={fetchVapidKey} className={btnCls}>
          WAS에서 VAPID Public Key 가져오기
        </button>
        {vapidPublicKey && (
          <pre className="mt-2 p-2 bg-zinc-50 rounded text-xs text-green-600 break-all">
            {vapidPublicKey}
          </pre>
        )}
      </Section>

      {/* Step 2 */}
      <Section title="Step 2. Push 구독 (Subscribe)">
        <button onClick={subscribePush} className={btnCls}>
          Service Worker 등록 + Push 구독
        </button>
        {swRegistered && (
          <span className="ml-3 text-sm text-green-600">SW 등록됨</span>
        )}
        {subscription && (
          <pre className="mt-2 p-2 bg-zinc-50 rounded text-xs text-blue-600 break-all max-h-32 overflow-auto">
            {JSON.stringify(subscription, null, 2)}
          </pre>
        )}
      </Section>

      {/* Step 3 */}
      <Section title="Step 3. 계정 바인딩 (Bind)">
        <p className="text-xs text-zinc-500 mb-2">
          JWT의 address와 디바이스(endpoint)를 연결합니다.
        </p>
        <button onClick={bindPush} className={btnCls}>
          Bind
        </button>
        {bound && (
          <span className="ml-3 text-sm text-green-600">바인딩 완료</span>
        )}
      </Section>

      {/* Step 4 */}
      <Section title="Step 4. Push 전송 테스트 (Send-Test)">
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-zinc-500 mb-1">title</label>
              <input
                className="w-full p-2 bg-white border border-zinc-300 rounded text-zinc-900 text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-zinc-500 mb-1">url</label>
              <input
                className="w-full p-2 bg-white border border-zinc-300 rounded text-zinc-900 text-sm"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-zinc-500 mb-1">body</label>
              <input
                className="w-full p-2 bg-white border border-zinc-300 rounded text-zinc-900 text-sm"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
            <button
              onClick={sendPush}
              className={`self-end ${btnCls}`}
            >
              Push 전송
            </button>
          </div>
        </div>
      </Section>

      {/* Step 5 */}
      <Section title="Step 5. 구독 해제 (Unsubscribe)">
        <button
          onClick={unsubscribePush}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          구독 해제
        </button>
      </Section>

      {/* Logs */}
      <Section title="로그">
        <div className="bg-zinc-50 rounded p-3 h-64 overflow-auto font-mono text-xs">
          {logs.length === 0 ? (
            <span className="text-zinc-500">로그가 여기에 표시됩니다...</span>
          ) : (
            logs.map((l, i) => (
              <div key={i} className="text-zinc-700 mb-1">
                {l}
              </div>
            ))
          )}
        </div>
        {logs.length > 0 && (
          <button
            onClick={() => setLogs([])}
            className="mt-2 text-xs text-zinc-500 hover:text-zinc-700"
          >
            로그 지우기
          </button>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-zinc-200 rounded-lg p-4 bg-white">
      <h3 className="text-sm font-semibold text-zinc-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

/** Base64 (standard 또는 URL-safe) → Uint8Array */
function base64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** JWT payload에서 master 주소 추출 */
function parseJwtMaster(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json).master || null;
  } catch {
    return null;
  }
}
