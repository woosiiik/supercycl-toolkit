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
      timezone: "+00:00",
    };
  }
  return {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "pnl_db",
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

// GET: Redis 시그널 조회 또는 MySQL 히스토리 조회
export async function GET(req: NextRequest) {
  const env = (req.nextUrl.searchParams.get("env") || "local") as DbEnv;
  const type = req.nextUrl.searchParams.get("type") || "redis";

  if (type === "redis") {
    return handleRedis(env);
  }
  return handleHistory(req, env);
}

async function handleRedis(env: DbEnv) {
  let redis: Redis | null = null;
  try {
    const config = getRedisConfig(env);
    redis = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      connectTimeout: 5000,
      lazyConnect: true,
    });
    await redis.connect();

    const [premiumData, smartData] = await Promise.all([
      redis.hgetall("ym:signal:premium"),
      redis.hgetall("ym:signal:smart"),
    ]);

    // premium: { "BTCUSDT:L1": '{"c":false,"ts":1713772800}', ... }
    const premium = Object.entries(premiumData).map(([field, value]) => {
      const [symbol, position] = field.split(":");
      const parsed = JSON.parse(value);
      return { symbol, position, confirmed: parsed.c, timestamp: parsed.ts };
    });

    // smart: { "BTCUSDT": '{"p":"LL","ts":1713772800}', ... }
    const smart = Object.entries(smartData).map(([symbol, value]) => {
      const parsed = JSON.parse(value);
      return { symbol, position: parsed.p, timestamp: parsed.ts };
    });

    return NextResponse.json({ premium, smart });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (redis) redis.disconnect();
  }
}

async function handleHistory(req: NextRequest, env: DbEnv) {
  const page = Number(req.nextUrl.searchParams.get("page") || 1);
  const limit = Number(req.nextUrl.searchParams.get("limit") || 30);
  const offset = (page - 1) * limit;

  let conn;
  try {
    conn = await mysql.createConnection(getDbConfig(env));

    const [[countRow]] = await conn.query(
      "SELECT COUNT(*) AS total FROM t_ym_signal_history",
    ) as [Array<{ total: number }>, unknown];

    const [rows] = await conn.query(
      `SELECT signal_history_no, signal_type, raw_data, created_at
       FROM t_ym_signal_history
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );

    return NextResponse.json({
      data: rows,
      total: countRow.total,
      page,
      limit,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
