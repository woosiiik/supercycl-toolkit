/**
 * MySQL origin DB에서 사용자 통계를 조회하여 CSV 파일로 내보내는 스크립트.
 *
 * 실행: npx tsx scripts/export-user-csv.ts
 * 출력: output/user-export-{날짜}.csv
 */

import "dotenv/config";
import mysql from "mysql2/promise";
import { writeFileSync, mkdirSync } from "fs";

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "supercycl",
};

interface UserRow {
  address: string;
  signup_memo: string | null;
  created_at: Date;
}

interface YmRow {
  address: string;
  ym_userid: string;
}

interface OkxRow {
  main_address: string;
}

async function main() {
  const conn = await mysql.createConnection(MYSQL_CONFIG);

  try {
    console.log("📊 MySQL에서 데이터 조회 중...\n");

    // 1. 전체 유저
    const [users] = (await conn.query(
      "SELECT address, signup_memo, created_at FROM t_user ORDER BY created_at ASC",
    )) as any;

    // 2. YM 연동 유저 (address → ym_userid 매핑)
    const [ymRows] = (await conn.query(
      "SELECT address, ym_userid FROM t_partner_youthmeta_user",
    )) as any;
    const ymMap = new Map<string, string>();
    for (const r of ymRows as YmRow[]) {
      ymMap.set(r.address, r.ym_userid);
    }

    // 3. OKX 연동 유저 (main_address set)
    const [okxRows] = (await conn.query(
      "SELECT main_address FROM t_exchange_account WHERE exchange_uid LIKE 'OKX\\_%'",
    )) as any;
    const okxSet = new Set<string>();
    for (const r of okxRows as OkxRow[]) {
      okxSet.add(r.main_address);
    }

    // CSV 생성
    const header =
      "Supercycl Account,EX 연동 유무,EX 계정 ID,OKX 연동 유무,Supercycl 최초 가입 경로,Supercycl 가입 시기";
    const lines: string[] = [header];

    for (const user of users as UserRow[]) {
      const addr = user.address;
      const exLinked = ymMap.has(addr);
      const exId = ymMap.get(addr) || "";
      const okxLinked = okxSet.has(addr);
      const route =
        user.signup_memo === "Youthmeta-event-20260411" ? "Mobile" : "PC";

      // UTC 그대로 출력
      const utc = new Date(user.created_at);
      const timeStr = utc.toISOString().replace("T", " ").slice(0, 19);

      lines.push(
        `${addr},${exLinked ? "O" : "X"},${exId},${okxLinked ? "O" : "X"},${route},${timeStr}`,
      );
    }

    // 파일 저장
    mkdirSync("output", { recursive: true });
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const filename = `output/user-export-${dateStr}.csv`;
    writeFileSync(filename, lines.join("\n"), "utf-8");

    // 터미널 미리보기 (최대 20행)
    console.log(`✅ ${(users as any[]).length}명 데이터 → ${filename}\n`);
    console.log("── 미리보기 (상위 20행) ──");
    console.log(header);
    for (const line of lines.slice(1, 21)) {
      console.log(line);
    }
    if ((users as any[]).length > 20) {
      console.log(`... 외 ${(users as any[]).length - 20}행`);
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
