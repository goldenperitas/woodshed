const fs = require("fs");
const Database = require("better-sqlite3");

// test tone into public/audio
const sr = 44100, dur = 6, n = sr * dur, buf = Buffer.alloc(44 + n * 2);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) { const t = i / sr, f = 220 + 90 * Math.sin(t * 1.2), s = Math.sin(2 * Math.PI * f * t) * 0.28 * 32767; buf.writeInt16LE(s | 0, 44 + i * 2); }
fs.mkdirSync("public/audio", { recursive: true }); fs.writeFileSync("public/audio/seed-tone.wav", buf);

const db = new Database("data/woodshed.db"); db.pragma("foreign_keys = ON");
const t = Date.now();
const ins = db.prepare("INSERT INTO standards (title,composer,key,form,feel,tempo_bpm,status,called_often,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
const tunes = [
  ["Autumn Leaves", "Joseph Kosma", "Gm", "AABC", "med swing", 140, 2, 1],
  ["So What", "Miles Davis", "Dm", "AABA", "med swing", 160, 3, 1],
  ["Blue Bossa", "Kenny Dorham", "Cm", "AABA", "bossa", 150, 2, 1],
  ["All The Things You Are", "Jerome Kern", "Ab", "AABA'", "med swing", 150, 1, 1],
  ['Take The "A" Train', "Billy Strayhorn", "C", "AABA", "med swing", 160, 1, 0],
  ["Stella By Starlight", "Victor Young", "Bb", "ABAC", "ballad", 120, 1, 0],
  ["Footprints", "Wayne Shorter", "Cm", "12 (6/4)", "waltz", 140, 2, 0],
  ["Recorda Me", "Joe Henderson", "Am", "AABA", "latin", 165, 1, 0],
];
const ids = tunes.map((x) => ins.run(...x, t, t).lastInsertRowid);
const rec = db.prepare("INSERT INTO recordings (standard_id,file_path,original_name,performer,year,instrumentation,is_reference,duration_sec,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
  .run(ids[0], "audio/seed-tone.wav", "seed-tone.wav", "Reference Take", 1958, "trio", 1, 6, t).lastInsertRowid;
db.prepare("INSERT INTO regions (recording_id,label,start_sec,end_sec) VALUES (?,?,?,?)").run(rec, "head", 0, 4);
db.prepare("UPDATE standards SET chord_interpretation=? WHERE id=?")
  .run("A: | Cm7 | F7 | BbM7 | EbM7 |\n   | Am7b5 | D7 | Gm6 |\nブリッジは同じ形の全音下。", ids[0]);
console.log("seeded", ids.length, "standards; recording", rec);
