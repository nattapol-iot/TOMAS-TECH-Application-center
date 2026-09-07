/**
 * Repair mojibake in knowledge_categories.name_th / name_ja.
 *
 * Cause: 910_knowledge_hub_seed.sql is UTF-8, but it was applied with
 * `sqlcmd -i` without `-f 65001`. sqlcmd then read the file in the system ANSI
 * code page, so every Thai and Japanese literal was mis-decoded on the way in
 * and stored wrong. The drivers were never at fault — the bytes in the table
 * are what is broken.
 *
 * This writes the correct text back through a parameterised query, which the
 * unicode-roundtrip spike proves is lossless.
 *
 * Idempotent: rows that are already correct are left alone.
 *
 * Run:  node backend-node/spike/repair-category-encoding.mjs
 *       node backend-node/spike/repair-category-encoding.mjs --dry-run
 */

import sql from "mssql/msnodesqlv8.js";

const dryRun = process.argv.includes("--dry-run");
const database = process.env.IOT_DB ?? "IoTTeamCenter_CodexTest_20260830_04";
const server = process.env.IOT_SQL_SERVER ?? "localhost";

/** code -> [name_th, name_ja], mirroring 910_knowledge_hub_seed.sql. */
const CATEGORIES = new Map([
  ["STANDARDS", ["มาตรฐานและ SOP", "標準・SOP"]],
  ["TEMPLATES", ["เทมเพลตและแบบฟอร์ม", "テンプレート・帳票"]],
  ["PRESENTATION", ["คลังพรีเซนเทชัน", "プレゼン資料"]],
  ["TECHNICAL", ["ความรู้ทางเทคนิค", "技術ナレッジ"]],
  ["LESSONS", ["บทเรียนจากโครงการ", "教訓"]],
  ["TEAMSHARED", ["เอกสารที่แชร์ในทีม", "チーム共有資料"]],
  ["PROJECTDOC", ["เอกสารโครงการ", "プロジェクト文書"]],
  ["SUPPLIERDOC", ["เอกสารผู้ขาย", "仕入先文書"]],
  ["ARCHIVE", ["เอกสารที่จัดเก็บ", "アーカイブ"]],

  ["STD.COMPANY", ["มาตรฐานบริษัท", "全社標準"]],
  ["STD.ENG", ["มาตรฐานวิศวกรรม", "技術標準"]],
  ["STD.WI", ["คู่มือปฏิบัติงาน", "作業手順書"]],
  ["STD.SAFETY", ["ความปลอดภัยและคุณภาพ", "安全・品質"]],
  ["TMP.ESTIMATE", ["เทมเพลตประมาณการ", "見積テンプレート"]],
  ["TMP.BOMPR", ["เทมเพลต BOM / PR", "BOM・PRテンプレート"]],
  ["TMP.CHECKLIST", ["เช็กลิสต์", "チェックリスト"]],
  ["TMP.REPORT", ["แบบฟอร์มรายงาน", "報告書式"]],
  ["PRS.COMPANY", ["โปรไฟล์บริษัท", "会社概要"]],
  ["PRS.SALES", ["พรีเซนเทชันขาย", "営業資料"]],
  ["PRS.TECH", ["พรีเซนเทชันเทคนิค", "技術資料"]],
  ["PRS.TRAINING", ["สื่อการอบรม", "研修資料"]],
  ["PRS.SLIDES", ["คลังสไลด์ที่อนุมัติ", "承認済スライド"]],
  ["TEC.ME", ["เครื่องกล", "機械"]],
  ["TEC.EE", ["ไฟฟ้า", "電気"]],
  ["TEC.SW", ["ซอฟต์แวร์", "ソフトウェア"]],
  ["TEC.ROBOT", ["หุ่นยนต์และออโตเมชัน", "ロボット・自動化"]],
  ["TEC.TROUBLE", ["การแก้ปัญหา", "トラブルシューティング"]],
]);

const pool = await new sql.ConnectionPool({
  connectionString:
    process.env.IOT_SQL_CONNECTION ??
    `Driver={ODBC Driver 18 for SQL Server};Server=${server};Database=${database};` +
      "Trusted_Connection=Yes;TrustServerCertificate=Yes;",
}).connect();

const existing = (await pool.request().query(
  "SELECT code, name_th, name_ja FROM dbo.knowledge_categories")).recordset;

let repaired = 0;
let alreadyCorrect = 0;
let unknown = 0;

for (const row of existing) {
  const expected = CATEGORIES.get(row.code);
  if (!expected) {
    unknown++;
    console.log(`  ?  ${row.code.padEnd(16)} not in the seed list — left alone`);
    continue;
  }
  const [th, ja] = expected;
  if (row.name_th === th && row.name_ja === ja) {
    alreadyCorrect++;
    continue;
  }
  console.log(`  ${dryRun ? "~" : "✓"}  ${row.code.padEnd(16)} ${row.name_th}  ->  ${th}`);
  if (!dryRun) {
    await pool.request()
      .input("code", sql.NVarChar(40), row.code)
      .input("th", sql.NVarChar(200), th)
      .input("ja", sql.NVarChar(200), ja)
      .query("UPDATE dbo.knowledge_categories SET name_th = @th, name_ja = @ja WHERE code = @code");
    repaired++;
  }
}

console.log("");
console.log(dryRun
  ? `${existing.length} rows checked · ${alreadyCorrect} already correct · ${existing.length - alreadyCorrect - unknown} would be repaired · ${unknown} unknown`
  : `${existing.length} rows checked · ${alreadyCorrect} already correct · ${repaired} repaired · ${unknown} unknown`);

// Verify by reading back through the driver.
if (!dryRun) {
  const check = (await pool.request()
    .input("code", sql.NVarChar(40), "STANDARDS")
    .query("SELECT name_th, name_ja FROM dbo.knowledge_categories WHERE code = @code")).recordset[0];
  const ok = check.name_th.includes("มาตรฐาน") && check.name_ja.includes("標準");
  console.log(ok ? `verified: ${check.name_th} / ${check.name_ja}` : "*** verification FAILED ***");
}

await pool.close();
