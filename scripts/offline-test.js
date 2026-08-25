#!/usr/bin/env node
// Offline end-to-end test.
//
// WHY THIS EXISTS: the browser available to the coding agent refuses to
// register service workers at all (even a one-line empty worker fails with
// "An unknown error occurred when fetching the script"), so nothing about
// offline behaviour can be checked there. This drives the Chrome already
// installed on the Mac, which registers workers normally.
//
//   npm run build && npx next start -p 3100
//   node scripts/offline-test.js
//
// Three situations, each in its own browser context:
//
//   一巡        warm online -> offline -> tune A -> wall -> tune B -> wall
//               -> tune C -> wall -> tune A -> the other screens
//   二重        a second document open at the same time as the first — the
//               OPFS backend takes exclusive handles, and this is where the
//               library used to come up empty
//   開き直し    the document closed and reopened straight onto a tune the
//               device has never fetched, which is §7's device procedure
//
// Each scenario ends by printing a meter read off the device's own event log.
// 文書ロード and DB開き直し are the pair to watch: while an offline screen
// change is a full document load, every tap adds one of each.
//
// Assertions are deliberately strict about what counts as a working page. An
// earlier, looser version reported PASS while the page was actually rendering
// the router's flight payload as plain text.

const { chromium } = require("playwright-core");

const BASE = process.env.BASE || "http://localhost:3100";
const CHROME =
  process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const log = (...a) => console.log(...a);
let failures = 0;
const check = (name, ok, detail = "") => {
  log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};

// Screens other than tune pages. Offline these are reached the same way — the
// router's payload fetch fails and the navigation falls through to the shell —
// so each one needs a marker only it renders.
const SCREENS = [
  { href: "/listening", marker: /LISTENING ROOM/ },
  { href: "/drill", marker: /曲名 → 情報/ },
  { href: "/groups", marker: /似た曲をまとめて/ },
];

/** Everything needed to judge what a given page is actually showing. */
function probe(page) {
  const bodyText = () => page.evaluate(() => document.body.innerText);
  const pathOf = () => new URL(page.url()).pathname;
  const wallCount = async () => (await bodyText()).match(/(\d+)\s*曲/)?.[1] ?? null;

  const tuneState = async () => {
    const t = await bodyText();
    if (/この曲は見つかりませんでした/.test(t)) return "NOT_FOUND:" + (t.match(/id:\s*(\S+)/)?.[1] ?? "");
    if (/棚を開けられませんでした/.test(t)) return "DB_ERROR";
    // A page showing flight data as text is broken even though it contains no
    // error message anywhere.
    if (/^\d+:[A-Z]\[/m.test(t) || /"ViewportBoundary"/.test(t)) return "RAW_PAYLOAD";
    // Sections every tune page renders. Not TAKES — a tune with no recordings
    // shows a placeholder instead of that heading.
    if (!/棚に戻る/.test(t) || !/コード解釈/.test(t) || !/ステータス/.test(t)) return "NOT_A_TUNE_PAGE";
    return t.split("\n").map((l) => l.trim()).filter(Boolean)[1] ?? "?";
  };

  const screenState = async (marker) => {
    const t = await bodyText();
    if (/^\d+:[A-Z]\[/m.test(t) || /"ViewportBoundary"/.test(t)) return "RAW_PAYLOAD";
    if (/棚を開けられませんでした/.test(t)) return "DB_ERROR";
    return marker.test(t) ? "OK" : "NO_MARKER";
  };

  const openTune = async (href) => {
    const link = page.locator(`a[href="${href}"]`).first();
    const found = await link.count();
    const before = pathOf();
    if (found) await link.click().catch((e) => log("   [click error] " + e.message.slice(0, 80)));
    else await page.goto(BASE + href, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(3000);
    log(`   [nav] want=${href} links=${found} ${before} -> ${pathOf()}`);
    return pathOf();
  };

  return { bodyText, pathOf, wallCount, tuneState, screenState, openTune };
}

const isTune = (v) =>
  !["DB_ERROR", "RAW_PAYLOAD", "NOT_A_TUNE_PAGE", "?"].includes(v) && !v.startsWith("NOT_FOUND");

/**
 * Gets a context to the state a phone is in at the start of §7's procedure:
 * worker registered, caches warm, one tune opened and the rest never fetched.
 */
async function warmUp(ctx, { assets = false } = {}) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log("   [pageerror]", e.message.slice(0, 160)));
  const p = probe(page);

  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const sw = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { has: !!r, state: r?.active?.state ?? null };
  });
  check("service worker registered", sw.has, JSON.stringify(sw));
  if (!sw.has) throw new Error("no service worker — nothing below can be trusted");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  check("controlled by the worker", await page.evaluate(() => !!navigator.serviceWorker.controller));
  check("wall renders online", (await p.wallCount()) === "81", "count=" + (await p.wallCount()));

  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="/standards/"]')]
      .map((a) => a.getAttribute("href"))
      .filter((h) => h !== "/standards/new"),
  );
  // A third unopened tune: the shell slot holds one document, and opening B
  // rewrites it. C proves the next tune is not pinned to whatever B left there.
  const tunes = { A: hrefs[0], B: hrefs[10], C: hrefs[20] };
  log(`   TUNE_A=${tunes.A}\n   TUNE_B=${tunes.B}\n   TUNE_C=${tunes.C}`);

  // Warm every screen, opening only TUNE_A, so B and C are genuinely pages
  // this device has never fetched.
  for (const path of ["/drill", "/listening", "/groups", "/debug", tunes.A, "/"]) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
  }

  if (assets) {
    const cached = await page.evaluate(async (list) => {
      const out = {};
      for (const a of list) out[a] = !!(await caches.match(a));
      return out;
    }, ["/sqlite/sqlite3.wasm", "/db-worker.js", "/standards/_shell", "/", "/debug"]);
    for (const [asset, ok] of Object.entries(cached)) check("cached " + asset, ok);
  }

  return { page, probe: p, tunes };
}

/** Clears the device's log so the meter describes only what follows. */
const startMeter = (page) => page.evaluate(() => localStorage.removeItem("woodshed.log"));

async function meter(page, label) {
  const journey = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("woodshed.log") || "[]"),
  );
  const count = (ev) => journey.filter((e) => e.ev === ev).length;
  const opens = journey.filter((e) => e.ev === "db.open");
  check(
    `${label}: the event log recorded the journey`,
    count("boot") > 0,
    `boot=${count("boot")} db.open=${opens.length} entries=${journey.length}`,
  );
  check(
    `${label}: nothing threw`,
    count("error") === 0,
    journey.filter((e) => e.ev === "error").map((e) => e.d?.msg).join(" / ") || "none",
  );
  log(
    `   [meter] 文書ロード ${count("boot")} / DB開き直し ${opens.length}` +
      ` / 最長 ${Math.max(0, ...opens.map((e) => Number(e.d?.ms ?? 0)))}ms` +
      ` / 取り合い ${opens.filter((e) => Number(e.d?.attempts ?? 1) > 1 || Number(e.d?.lockMs ?? 0) > 0).length}` +
      ` / payload取り逃し ${count("sw.payload.miss")}`,
  );
}

// ---------------------------------------------------------------- scenarios

async function journey(ctx) {
  const { page, probe: p, tunes } = await warmUp(ctx, { assets: true });

  await startMeter(page);
  await ctx.setOffline(true);
  log("   --- offline ---");

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(3500);
  check("wall opens offline", (await p.wallCount()) === "81", "count=" + (await p.wallCount()));

  const landedA = await p.openTune(tunes.A);
  const a1 = await p.tuneState();
  check("tune A opens offline", isTune(a1) && landedA === tunes.A, `${a1} @ ${landedA}`);

  await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);
  check("back to the wall", (await p.wallCount()) === "81", "count=" + (await p.wallCount()));

  const landedB = await p.openTune(tunes.B);
  const b = await p.tuneState();
  // The URL check matters: a passing title with the wrong URL means the click
  // went somewhere else entirely.
  check("tune B (never opened online) opens offline", isTune(b) && landedB === tunes.B, `${b} @ ${landedB}`);
  check("tune B is a different tune from A", b !== a1, `${a1} vs ${b}`);

  await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);
  const landedC = await p.openTune(tunes.C);
  const c = await p.tuneState();
  check("tune C (never opened online) opens offline", isTune(c) && landedC === tunes.C, `${c} @ ${landedC}`);
  check("tune C is a different tune from A and B", c !== a1 && c !== b, `${a1} / ${b} / ${c}`);

  await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);
  const landedA2 = await p.openTune(tunes.A);
  const a2 = await p.tuneState();
  check("tune A still works after B", isTune(a2) && a2 === a1 && landedA2 === tunes.A, `${a1} -> ${a2} @ ${landedA2}`);

  // The other screens, reached by tapping the wall's nav the way a hand does.
  for (const { href, marker } of SCREENS) {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(2500);
    const link = page.locator(`a[href="${href}"]`).first();
    if (await link.count()) await link.click().catch((e) => log("   [click error] " + e.message.slice(0, 80)));
    await page.waitForTimeout(3000);
    const st = await p.screenState(marker);
    check(`${href} opens offline`, st === "OK" && p.pathOf() === href, `${st} @ ${p.pathOf()}`);
  }

  await meter(page, "一巡");
}

async function twoDocuments(ctx) {
  const { page, probe: p, tunes } = await warmUp(ctx);

  await startMeter(page);
  await ctx.setOffline(true);
  log("   --- offline, second document ---");

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(3000);
  check("first document has the wall", (await p.wallCount()) === "81", "count=" + (await p.wallCount()));

  // The OPFS backend takes exclusive access handles, so only one document can
  // hold the database. Either outcome is acceptable here — waiting its turn,
  // or saying plainly that another tab has it. What is not acceptable is a
  // shelf that renders as empty, which is how a storage failure used to look.
  const second = await ctx.newPage();
  const p2 = probe(second);
  await second.goto(BASE + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
  await second.waitForTimeout(6000);
  const text2 = await p2.bodyText();
  const count2 = await p2.wallCount();
  const said = /棚を開けられませんでした/.test(text2);
  check(
    "second document either opens or says why not",
    count2 === "81" || said,
    said ? "explicit DB error" : "count=" + count2,
  );
  check("second document never shows an empty shelf", count2 !== "0", "count=" + count2);

  await second.close();
  await page.waitForTimeout(1500);

  // Closing the second must not have cost the first its database.
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(3500);
  check("first document survives the second closing", (await p.wallCount()) === "81", "count=" + (await p.wallCount()));

  const landed = await p.openTune(tunes.B);
  const t = await p.tuneState();
  check("and can still open a tune", isTune(t) && landed === tunes.B, `${t} @ ${landed}`);

  await meter(page, "二重");
}

async function relaunch(ctx) {
  const { page, probe: p, tunes } = await warmUp(ctx);

  await startMeter(page);
  await ctx.setOffline(true);
  log("   --- offline, closed and reopened ---");

  // What §7 asks the user to do: kill the app, then start it again with no
  // network. Storage survives; the document does not.
  await page.close();
  const fresh = await ctx.newPage();
  fresh.on("pageerror", (e) => log("   [pageerror]", e.message.slice(0, 160)));
  const pf = probe(fresh);

  await fresh.goto(BASE + tunes.C, { waitUntil: "domcontentloaded" }).catch(() => {});
  await fresh.waitForTimeout(4000);
  const t = await pf.tuneState();
  check(
    "reopens straight onto a tune it has never fetched",
    isTune(t) && pf.pathOf() === tunes.C,
    `${t} @ ${pf.pathOf()}`,
  );

  await fresh.goto(BASE + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
  await fresh.waitForTimeout(3000);
  check("and the wall is all there", (await pf.wallCount()) === "81", "count=" + (await pf.wallCount()));

  await meter(fresh, "開き直し");
}

// --------------------------------------------------------------------- main

const SCENARIOS = [
  ["一巡", journey],
  ["二重", twoDocuments],
  ["開き直し", relaunch],
];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });

  for (const [name, run] of SCENARIOS) {
    log(`\n=== ${name} ===`);
    // A fresh context per scenario: storage, caches and the worker all start
    // from nothing, so one scenario can never explain another's result.
    const ctx = await browser.newContext({ serviceWorkers: "allow" });
    try {
      await run(ctx);
    } catch (e) {
      check(`${name}: ran to completion`, false, e.message.slice(0, 160));
    } finally {
      await ctx.close();
    }
  }

  await browser.close();
  log(failures ? `\n${failures} FAILURE(S)` : "\nall offline checks passed");
  process.exit(failures ? 1 : 0);
})();
