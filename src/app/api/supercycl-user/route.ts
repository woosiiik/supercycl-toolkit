import mysql from "mysql2/promise";
import { NextRequest, NextResponse } from "next/server";

type DbEnv = "dev" | "staging" | "prod";

function getDbConfig(env: DbEnv) {
  if (env === "prod") {
    return {
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE || "pnl_db",
    };
  }
  if (env === "staging") {
    return {
      host: process.env.MYSQL_HOST_STAGING || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT_STAGING || 3306),
      user: process.env.MYSQL_USER_STAGING || "root",
      password: process.env.MYSQL_PASSWORD_STAGING || "",
      database: process.env.MYSQL_DATABASE_STAGING || "pnl_db",
    };
  }
  // dev
  return {
    host: process.env.MYSQL_HOST_DEV || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT_DEV || 3306),
    user: process.env.MYSQL_USER_DEV || "root",
    password: process.env.MYSQL_PASSWORD_DEV || "",
    database: process.env.MYSQL_DATABASE_DEV || "pnl_db",
  };
}

function parseEnv(raw: string | null): DbEnv {
  if (raw === "prod" || raw === "staging" || raw === "dev") return raw;
  return "dev";
}

// 행당 표시할 최대 행 수 (이력성 테이블이 클 수 있어 미리보기 제한)
const ROW_LIMIT = 200;

interface TableInfo {
  table: string;
  keyColumn: string;
  count: number;
  rows: Record<string, unknown>[];
  truncated: boolean;
}

// 주소를 참조하는 모든 테이블(address / main_address 컬럼)을 INFORMATION_SCHEMA에서 탐색
async function discoverAddressTables(
  conn: mysql.Connection,
  database: string,
): Promise<{ table: string; column: string }[]> {
  const [rows] = (await conn.query(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS c
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND COLUMN_NAME IN ('address', 'main_address')
      ORDER BY TABLE_NAME`,
    [database],
  )) as [Array<{ t: string; c: string }>, unknown];

  // 한 테이블에 두 컬럼이 모두 있으면 address 우선
  const byTable = new Map<string, string>();
  for (const r of rows) {
    if (!byTable.has(r.t) || r.c === "address") byTable.set(r.t, r.c);
  }
  return Array.from(byTable.entries()).map(([table, column]) => ({
    table,
    column,
  }));
}

// 주소로 연결된 ym_uid 목록 조회 (watchlist 등 ym_uid 기반 테이블 처리용)
async function resolveYmUids(
  conn: mysql.Connection,
  address: string,
): Promise<Array<string | number>> {
  try {
    const [rows] = (await conn.query(
      "SELECT DISTINCT ym_uid FROM t_partner_youthmeta_user WHERE address = ?",
      [address],
    )) as [Array<{ ym_uid: string | number }>, unknown];
    return rows.map((r) => r.ym_uid).filter((v) => v != null);
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const env = parseEnv(req.nextUrl.searchParams.get("env"));
  const address = (req.nextUrl.searchParams.get("address") || "").trim();

  if (!address) {
    return NextResponse.json(
      { error: "address를 입력하세요" },
      { status: 400 },
    );
  }

  const config = getDbConfig(env);
  let conn;
  try {
    conn = await mysql.createConnection(config);

    const addressTables = await discoverAddressTables(conn, config.database);
    const ymUids = await resolveYmUids(conn, address);

    const tables: TableInfo[] = [];

    // 1) address / main_address 기반 테이블
    for (const { table, column } of addressTables) {
      const [countRows] = (await conn.query(
        `SELECT COUNT(*) AS cnt FROM \`${table}\` WHERE \`${column}\` = ?`,
        [address],
      )) as [Array<{ cnt: number }>, unknown];
      const count = Number(countRows[0]?.cnt || 0);
      if (count === 0) continue;

      const [rows] = (await conn.query(
        `SELECT * FROM \`${table}\` WHERE \`${column}\` = ? LIMIT ${ROW_LIMIT}`,
        [address],
      )) as [Array<Record<string, unknown>>, unknown];

      tables.push({
        table,
        keyColumn: column,
        count,
        rows,
        truncated: count > rows.length,
      });
    }

    // 2) ym_uid 기반 테이블 (t_ym_user_watchlist) — address 컬럼이 없어 별도 처리
    if (ymUids.length > 0) {
      const placeholders = ymUids.map(() => "?").join(",");
      try {
        const [countRows] = (await conn.query(
          `SELECT COUNT(*) AS cnt FROM t_ym_user_watchlist WHERE ym_uid IN (${placeholders})`,
          ymUids,
        )) as [Array<{ cnt: number }>, unknown];
        const count = Number(countRows[0]?.cnt || 0);
        if (count > 0) {
          const [rows] = (await conn.query(
            `SELECT * FROM t_ym_user_watchlist WHERE ym_uid IN (${placeholders}) LIMIT ${ROW_LIMIT}`,
            ymUids,
          )) as [Array<Record<string, unknown>>, unknown];
          tables.push({
            table: "t_ym_user_watchlist",
            keyColumn: "ym_uid",
            count,
            rows,
            truncated: count > rows.length,
          });
        }
      } catch {
        // 테이블이 없으면 무시
      }
    }

    const totalRows = tables.reduce((sum, t) => sum + t.count, 0);

    return NextResponse.json({
      env,
      address,
      ymUids,
      found: tables.length > 0,
      totalRows,
      tables,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
