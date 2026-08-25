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
// Reproduces the sequence that fails on the iPhone:
//   warm online -> go offline -> tune A -> wall -> tune B -> wall -> tune C
//   -> wall -> tune A -> each of the other screens
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

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const ctx = await browser.newContext({ serviceWorkers: "allow" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log("   [pageerror]", e.message.slice(0, 160)));

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
  // Screens other than tune pages. Offline these are reached the same way — the
  // router's payload fetch fails and the navigation falls through to the shell —
  // so each one needs a marker only it renders.
  const SCREENS = [
    { href: "/listening", marker: /LISTENING ROOM/ },
    { href: "/drill", marker: /曲名 → 情報/ },
    { href: "/groups", marker: /似た曲をまとめて/ },
  ];
  const screenState = async (marker) => {
    const t = await bodyText();
    if (/^\d+:[A-Z]\[/m.test(t) || /"ViewportBoundary"/.test(t)) return "RAW_PAYLOAD";
    if (/棚を開けられませんでした/.test(t)) return "DB_ERROR";
    return marker.test(t) ? "OK" : "NO_MARKER";
  };

  const isTune = (v) =>
    !["DB_ERROR", "RAW_PAYLOAD", "NOT_A_TUNE_PAGE", "?"].includes(v) && !v.startsWith("NOT_FOUND");

  // ---- online: register the worker and warm the caches ----
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const sw = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { has: !!r, state: r?.active?.state ?? null };
  });
  check("service worker registered", sw.has, JSON.stringify(sw));
  if (!sw.has) {
    await browser.close();
    process.exit(1);
  }

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  check("controlled by the worker", await page.evaluate(() => !!navigator.serviceWorker.controller));
  check("wall renders online", (await wallCount()) === "81", "count=" + (await wallCount()));

  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="/standards/"]')]
      .map((a) => a.getAttribute("href"))
      .filter((h) => h !== "/standards/new"),
  );
  const TUNE_A = hrefs[0];
  const TUNE_B = hrefs[10];
  // A third unopened tune: the shell slot holds one document, and opening B
  // rewrites it. C proves the next tune is not pinned to whatever B left there.
  const TUNE_C = hrefs[20];
  log(`   TUNE_A=${TUNE_A}\n   TUNE_B=${TUNE_B}\n   TUNE_C=${TUNE_C}`);

  // Warm every screen, opening only TUNE_A, so TUNE_B is genuinely a page this
  // device has never fetched.
  for (const p of ["/drill", "/listening", "/groups", "/debug", TUNE_A, "/"]) {
    await page.goto(BASE + p, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
  }

  const cached = await page.evaluate(async (assets) => {
    const out = {};
    for (const a of assets) out[a] = !!(await caches.match(a));
    return out;
  }, ["/sqlite/sqlite3.wasm", "/db-worker.js", "/standards/_shell", "/", "/debug"]);
  for (const [asset, ok] of Object.entries(cached)) check("cached " + asset, ok);

  // ---- offline ----
  // Cleared so the meter at the end describes the offline journey alone.
  await page.evaluate(() => localStorage.removeItem("woodshed.log"));
  await ctx.setOffline(true);
  log("\n--- offline ---");

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(3500);
  check("wall opens offline", (await wallCount()) === "81", "count=" + (await wallCount()));

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

  const landedA = await openTune(TUNE_A);
  const a1 = await tuneState();
  check("tune A opens offline", isTune(a1) && landedA === TUNE_A, `${a1} @ ${landedA}`);

  await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);
  check("back to the wall", (await wallCount()) === "81", "count=" + (await wallCount()));

  const landedB = await openTune(TUNE_B);
  const b = await tuneState();
  // The URL check matters: a passing title with the wrong URL means the click
  // went somewhere else entirely.
  check("tune B (never opened online) opens offline", isTune(b) && landedB === TUNE_B, `${b} @ ${landedB}`);
  check("tune B is a different tune from A", b !== a1, `${a1} vs ${b}`);

  await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);
  const landedC = await openTune(TUNE_C);
  const c = await tuneState();
  check("tune C (never opened online) opens offline", isTune(c) && landedC === TUNE_C, `${c} @ ${landedC}`);
  check("tune C is a different tune from A and B", c !== a1 && c !== b, `${a1} / ${b} / ${c}`);

  await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);
  const landedA2 = await openTune(TUNE_A);
  const a2 = await tuneState();
  check("tune A still works after B", isTune(a2) && a2 === a1 && landedA2 === TUNE_A, `${a1} -> ${a2} @ ${landedA2}`);

  // The other screens, reached by tapping the wall's nav the way a hand does.
  for (const { href, marker } of SCREENS) {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(2500);
    const link = page.locator(`a[href="${href}"]`).first();
    if (await link.count()) await link.click().catch((e) => log("   [click error] " + e.message.slice(0, 80)));
    await page.waitForTimeout(3000);
    const st = await screenState(marker);
    check(`${href} opens offline`, st === "OK" && pathOf() === href, `${st} @ ${pathOf()}`);
  }

  // ---- the instrument ----
  // The device's own event log is the only way to see what happens inside the
  // iPhone, so it has to be covered like anything else. The meter it prints is
  // the baseline for the work to reduce it: today every offline tap costs a
  // whole document and a fresh database open.
  const journey = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("woodshed.log") || "[]"),
  );
  const count = (ev) => journey.filter((e) => e.ev === ev).length;
  const opens = journey.filter((e) => e.ev === "db.open");
  check(
    "the event log recorded the journey",
    count("boot") > 0 && opens.length > 0,
    `boot=${count("boot")} db.open=${opens.length} entries=${journey.length}`,
  );
  check(
    "nothing threw during the journey",
    count("error") === 0,
    journey.filter((e) => e.ev === "error").map((e) => e.d?.msg).join(" / ") || "none",
  );
  log(
    `   [meter] 文書ロード ${count("boot")} / DB開き直し ${opens.length}` +
      ` / 最長 ${Math.max(0, ...opens.map((e) => Number(e.d?.ms ?? 0)))}ms` +
      ` / 取り合い ${opens.filter((e) => Number(e.d?.attempts ?? 1) > 1 || Number(e.d?.lockMs ?? 0) > 0).length}` +
      ` / payload取り逃し ${count("sw.payload.miss")}`,
  );

  await browser.close();
  log(failures ? `\n${failures} FAILURE(S)` : "\nall offline checks passed");
  process.exit(failures ? 1 : 0);
})();
