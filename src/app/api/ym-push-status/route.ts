import mysql from "mysql2/promise";
import Redis from "ioredis";
import { NextRequest, NextResponse } from "next/server";

type DbEnv = "local" | "dev";

function getDbConfig(env: DbEnv) {
  if (env === "dev") {
    return {
      host: process.env.MYSQL_HOST_DEV || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT_DEV || 3306),
      user: process.env.MYSQL_USER_DEV || "root",
      password: process.env.MYSQL_PASSWORD_DEV || "",
      database: process.env.MYSQL_DATABASE_DEV || "pnl_db",
    };
  }
  return {
    host: "127.0.0.1",
    port: 3307,
    user: "pnl",
    password: "password",
    database: "pnl_db",
    timezone: "+00:00",
  };
}

function getRedisConfig(env: DbEnv) {
  if (env === "dev") {
    return {
      host: process.env.REDIS_HOST_DEV || "127.0.0.1",
      port: Number(process.env.REDIS_PORT_DEV || 6379),
      password: process.env.REDIS_PASSWORD_DEV || undefined,
    };
  }
  return {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

export async function GET(req: NextRequest) {
  const env = (req.nextUrl.searchParams.get("env") || "local") as DbEnv;
  const inputAddress = req.nextUrl.searchParams.get("address") || "";
  const inputUid = req.nextUrl.searchParams.get("uid") || "";

  const type = req.nextUrl.searchParams.get("type") || "";

  if (!inputAddress && !inputUid) {
    return NextResponse.json({ error: "address 또는 uid를 입력하세요" }, { status: 400 });
  }

  // 포지션만 새로고침
  if (type === "positions") {
    return handlePositions(env, inputAddress, inputUid);
  }

  let conn;
  let redis: Redis | null = null;
  try {
    conn = await mysql.createConnection(getDbConfig(env));

    // UID → address 변환 또는 address → UID 조회
    let address = inputAddress;
    let exchangeKeys: Array<{ address: string; exchange_name: string; uid: string }> = [];

    if (inputUid && !inputAddress) {
      // UID로 address 찾기
      const [rows] = await conn.query(
        "SELECT address, exchange_name, uid FROM t_sync_exchange_key WHERE uid = ?",
        [inputUid],
      ) as [Array<{ address: string; exchange_name: string; uid: string }>, unknown];
      exchangeKeys = rows;
      if (rows.length > 0) {
        address = rows[0].address;
      } else {
        return NextResponse.json({
          error: `UID '${inputUid}'에 해당하는 address를 찾을 수 없습니다`,
          exchangeKeys: [],
        }, { status: 404 });
      }
    } else {
      // address로 exchange key 조회
      const [rows] = await conn.query(
        "SELECT address, exchange_name, uid FROM t_sync_exchange_key WHERE address = ?",
        [address],
      ) as [Array<{ address: string; exchange_name: string; uid: string }>, unknown];
      exchangeKeys = rows;
    }

    // 1. t_user
    const [userRows] = await conn.query(
      "SELECT address, affiliate_no, created_at FROM t_user WHERE address = ?",
      [address],
    ) as [Array<{ address: string; affiliate_no: number | null; created_at: string }>, unknown];
    const user = userRows[0] || null;

    // 2. t_partner_youthmeta_user
    const [ymUserRows] = await conn.query(
      `SELECT ym_uid, ym_userid, ym_end_date, is_admin, is_premium, is_smart, status, created_at, updated_at
       FROM t_partner_youthmeta_user WHERE address = ? ORDER BY updated_at DESC`,
      [address],
    ) as [Array<Record<string, unknown>>, unknown];
    const ymUser = ymUserRows[0] || null;

    // 3. t_ym_watchlist
    const [watchlistRows] = await conn.query(
      "SELECT symbol FROM t_ym_watchlist WHERE address = ? ORDER BY symbol",
      [address],
    ) as [Array<{ symbol: string }>, unknown];
    const watchlist = watchlistRows.map((r) => r.symbol);

    // 4. t_push_subscription_pwa
    const [pushRows] = await conn.query(
      "SELECT subscription_no, endpoint, address, last_bind_time, created_at FROM t_push_subscription_pwa WHERE address = ?",
      [address],
    ) as [Array<Record<string, unknown>>, unknown];

    // 5. t_user_settings_notification
    const [notifRows] = await conn.query(
      `SELECT ym_signal_enabled, ym_signal_signal_occur, ym_signal_signal_confirm, ym_signal_counter_position
       FROM t_user_settings_notification WHERE address = ?`,
      [address],
    ) as [Array<{
      ym_signal_enabled: number;
      ym_signal_signal_occur: number;
      ym_signal_signal_confirm: number;
      ym_signal_counter_position: number;
    }>, unknown];
    // 설정이 없으면 모두 ON (default)
    const notifSettings = notifRows[0] || {
      ym_signal_enabled: 1,
      ym_signal_signal_occur: 1,
      ym_signal_signal_confirm: 1,
      ym_signal_counter_position: 1,
    };
    const notifExists = notifRows.length > 0;

    // 6. Redis: coin:position 조회
    let positions: Array<{ symbol: string; direction: string; member: string }> = [];
    const okxKey = exchangeKeys.find((k) => k.exchange_name === "OKX");

    if (okxKey?.uid) {
      const redisConfig = getRedisConfig(env);
      redis = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        connectTimeout: 5000,
        lazyConnect: true,
      });
      await redis.connect();

      const memberKey = `okx:${okxKey.uid}`;
      // 워치리스트 코인뿐 아니라 전체 포지션 조회
      // 워치리스트가 있으면 워치리스트 기준, 없으면 빈배열
      const symbolsToCheck = watchlist.length > 0 ? watchlist : [];

      for (const symbol of symbolsToCheck) {
        for (const dir of ["long", "short"]) {
          const members = await redis.smembers(`coin:position:${symbol}:${dir}`);
          if (members.includes(memberKey)) {
            positions.push({ symbol, direction: dir, member: memberKey });
          }
        }
      }
    }

    return NextResponse.json({
      address,
      user,
      ymUser,
      watchlist,
      pushSubscriptions: pushRows,
      notifSettings: { ...notifSettings, _exists: notifExists },
      exchangeKeys,
      positions,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (conn) await conn.end();
    if (redis) redis.disconnect();
  }
}

async function handlePositions(env: DbEnv, inputAddress: string, inputUid: string) {
  let conn;
  let redis: Redis | null = null;
  try {
    conn = await mysql.createConnection(getDbConfig(env));

    let address = inputAddress;
    if (inputUid && !inputAddress) {
      const [rows] = await conn.query(
        "SELECT address FROM t_sync_exchange_key WHERE uid = ? LIMIT 1",
        [inputUid],
      ) as [Array<{ address: string }>, unknown];
      if (rows.length === 0) {
        return NextResponse.json({ positions: [] });
      }
      address = rows[0].address;
    }

    // exchange key에서 OKX uid 조회
    const [exRows] = await conn.query(
      "SELECT uid FROM t_sync_exchange_key WHERE address = ? AND exchange_name = 'OKX' LIMIT 1",
      [address],
    ) as [Array<{ uid: string }>, unknown];

    if (exRows.length === 0 || !exRows[0].uid) {
      return NextResponse.json({ positions: [] });
    }

    // watchlist 조회
    const [wlRows] = await conn.query(
      "SELECT symbol FROM t_ym_watchlist WHERE address = ?",
      [address],
    ) as [Array<{ symbol: string }>, unknown];
    const watchlist = wlRows.map((r) => r.symbol);

    if (watchlist.length === 0) {
      return NextResponse.json({ positions: [] });
    }

    const redisConfig = getRedisConfig(env);
    redis = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      connectTimeout: 5000,
      lazyConnect: true,
    });
    await redis.connect();

    const memberKey = `okx:${exRows[0].uid}`;
    const positions: Array<{ symbol: string; direction: string; member: string }> = [];

    for (const symbol of watchlist) {
      for (const dir of ["long", "short"]) {
        const members = await redis.smembers(`coin:position:${symbol}:${dir}`);
        if (members.includes(memberKey)) {
          positions.push({ symbol, direction: dir, member: memberKey });
        }
      }
    }

    return NextResponse.json({ positions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (conn) await conn.end();
    if (redis) redis.disconnect();
  }
}
