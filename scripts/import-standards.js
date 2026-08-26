// One-off importer for bulk-adding standards from a CSV.
// Usage:
//   node scripts/import-standards.js <csv> --dry   (preview only)
//   node scripts/import-standards.js <csv>         (insert)
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const csvPath = process.argv[2];
const dry = process.argv.includes("--dry");
if (!csvPath) {
  console.error("csv path required");
  process.exit(1);
}

// Minimal RFC-4180-ish CSV parser (handles quotes, escaped "" and commas).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length && r.some((x) => x.trim() !== ""));
}

const raw = fs.readFileSync(csvPath, "utf8");
const rows = parseCsv(raw);
const header = rows[0].map((h) => h.trim());
const body = rows.slice(1);

const idx = (name) => header.indexOf(name);
const iTitle = idx("title");
if (iTitle < 0) { console.error("no 'title' column"); process.exit(1); }

const toInt = (v) => {
  const s = (v ?? "").trim();
  if (s === "") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
};
const str = (v) => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

const records = body.map((r) => ({
  title: str(r[iTitle]),
  composer: str(r[idx("composer")]),
  key: str(r[idx("key")]),
  form: str(r[idx("form")]),
  feel: str(r[idx("feel")]),
  tempoBpm: toInt(r[idx("tempoBpm")]),
  status: toInt(r[idx("status")]) ?? 0,
  calledOften: toInt(r[idx("calledOften")]) ?? 0,
})).filter((x) => x.title);

const dbPath = path.join(__dirname, "..", "data", "woodshed.db");
const db = new Database(dbPath);
const existing = new Set(
  db.prepare("select lower(title) t from standards").all().map((r) => r.t),
);

const seen = new Set();
const toInsert = [];
const dupExisting = [];
const dupInFile = [];
for (const rec of records) {
  const key = rec.title.toLowerCase();
  if (existing.has(key)) { dupExisting.push(rec.title); continue; }
  if (seen.has(key)) { dupInFile.push(rec.title); continue; }
  seen.add(key);
  toInsert.push(rec);
}

console.log(`parsed rows:      ${records.length}`);
console.log(`already in DB:    ${dupExisting.length}${dupExisting.length ? " -> " + dupExisting.join(", ") : ""}`);
console.log(`dup within file:  ${dupInFile.length}${dupInFile.length ? " -> " + dupInFile.join(", ") : ""}`);
console.log(`will insert:      ${toInsert.length}`);
const byStatus = toInsert.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
const often = toInsert.filter((r) => r.calledOften === 1).length;
console.log(`  status split:   ${JSON.stringify(byStatus)}  | calledOften=1: ${often}`);
const badStatus = toInsert.filter((r) => ![0, 1, 2, 3].includes(r.status));
if (badStatus.length) console.log(`  ! bad status:   ${badStatus.map((r) => r.title + "=" + r.status).join(", ")}`);

if (dry) { console.log("\n(dry run — nothing written)"); process.exit(0); }

const now = Date.now();
const stmt = db.prepare(
  `insert into standards (title, composer, key, form, feel, tempo_bpm, status, called_often, created_at, updated_at)
   values (@title, @composer, @key, @form, @feel, @tempoBpm, @status, @calledOften, @now, @now)`,
);
const insertMany = db.transaction((rs) => {
  for (const r of rs) stmt.run({ ...r, now });
});
insertMany(toInsert);
console.log(`\ninserted ${toInsert.length}. total standards now: ${db.prepare("select count(*) c from standards").get().c}`);
