"use client";

// Diagnostics. Everything that makes this app work offline is invisible when
// it works and silent when it doesn't — the service worker, the caches, the
// device database, the sync cursor. Without somewhere to look, a bug report
// can only say "it didn't open", which is not enough to fix anything.
//
// Deliberately plain, and reachable offline (the service worker precaches it).

import { useCallback, useEffect, useState } from "react";
import AppHeader, { BackArrow } from "@/components/AppHeader";
import { rawAll, ready, getMeta, resetLocalDatabase } from "@/lib/local/db";
import { sync, lastSync, pendingCount } from "@/lib/local/sync";
import { SYNC_TABLES } from "@/lib/sync/schema";
import { listOfflineKeys, storageEstimate, missingOffline, fetchOfflineCopies } from "@/lib/offline";
import { readLog, clearLog, formatLog, summarize, RUN_ID } from "@/lib/local/log";
import type { LogEntry } from "@/lib/local/log";

type Row = { label: string; value: string; bad?: boolean };

// The four things without which nothing opens offline. "/" is the shell,
// and one shell now answers a navigation to any screen.
const KEY_ASSETS = ["/sqlite/sqlite3.wasm", "/db-worker.js", "/", "/fonts/anton.woff2"];

export default function Diagnostics() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState("");

  const collect = useCallback(async (): Promise<{ rows: Row[]; missing: string[] }> => {
    const out: Row[] = [];
    let gone: string[] = [];
    const push = (label: string, value: unknown, bad = false) =>
      out.push({ label, value: String(value), bad });

    // The meter. Boots and DB opens are the pair worth watching: while an
    // offline screen change is a full page load, each tap adds one of each.
    const m = summarize();
    push(`直近${m.windowMin}分の文書ロード`, `${m.boots} 回 (うち再読込/戻る ${m.reloads})`);
    push(`直近${m.windowMin}分のDB開き直し`, `${m.dbOpens} 回`, m.dbContended > 0);
    push("  最長", `${m.dbOpenMaxMs} ms`);
    push("  取り合いが起きた回数", `${m.dbContended} 回`, m.dbContended > 0);
    push("  失敗イベント", `${m.failures} 件`, m.failures > 0);
    push("この文書", RUN_ID);

    push("オンライン", navigator.onLine ? "yes" : "no (圏外)");
    push("表示モード", window.matchMedia("(display-mode: standalone)").matches ? "PWA" : "ブラウザ");

    // --- service worker ---
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      push("SW 登録", regs.length ? `${regs.length}件` : "なし", regs.length === 0);
      push("SW 状態", regs[0]?.active?.state ?? "-", regs[0]?.active?.state !== "activated");
      push("SW 制御下", navigator.serviceWorker.controller ? "yes" : "no", !navigator.serviceWorker.controller);
    } catch (e) {
      push("SW", (e as Error).message, true);
    }

    // --- caches ---
    try {
      const names = await caches.keys();
      push("キャッシュ", names.join(", ") || "なし", names.length === 0);
      for (const n of names) {
        const c = await caches.open(n);
        push(`  ${n}`, `${(await c.keys()).length} 件`);
      }
      for (const asset of KEY_ASSETS) {
        const hit = await caches.match(asset);
        push(`  ${asset}`, hit ? "あり" : "なし", !hit);
      }
    } catch (e) {
      push("キャッシュ", (e as Error).message, true);
    }

    // --- device database ---
    try {
      await ready();
      for (const t of SYNC_TABLES) {
        const live = await rawAll(`SELECT COUNT(*) FROM ${t} WHERE deleted_at IS NULL`);
        const all = await rawAll(`SELECT COUNT(*) FROM ${t}`);
        push(`  ${t}`, `${live[0]?.[0] ?? 0} 件 (墓標込 ${all[0]?.[0] ?? 0})`);
      }
      push("未送信の変更", `${await pendingCount()} 件`);
      push("同期カーソル", (await getMeta("sync.cursor")) ?? "0");
    } catch (e) {
      push("DB", (e as Error).message, true);
    }

    // --- media on this device ---
    try {
      const keys = await listOfflineKeys();
      const { usage, quota } = await storageEstimate();
      push("端末内の音源/画像", `${keys.length} 件`);
      push("ストレージ使用量", `${(usage / 1e6).toFixed(1)} MB / ${(quota / 1e6).toFixed(0)} MB`);

      // What would not play in the car. After a rebuild from the Mac this is
      // every take there is, which is the moment it most needs saying.
      const paths = (await rawAll(
        "SELECT file_path FROM recordings WHERE deleted_at IS NULL",
      )).map((r) => String(r[0] ?? ""));
      gone = await missingOffline(paths);
      push("端末に無い音源", `${gone.length} 件 / 全${paths.length} 件`, gone.length > 0);
    } catch (e) {
      push("メディア", (e as Error).message, true);
    }

    const last = lastSync();
    push(
      "最後の同期",
      last
        ? `${new Date(last.at).toLocaleString("ja-JP")} — ${last.ok ? `送信${last.pushed} 受信${last.pulled}` : `失敗: ${last.error}`}`
        : "まだ一度も実行していない",
      last ? !last.ok : false,
    );

    return { rows: out, missing: gone };
  }, []);

  const refresh = useCallback(() => {
    collect().then(({ rows: r, missing: m }) => {
      setRows(r);
      setMissing(m);
    });
    setLog(readLog());
  }, [collect]);

  useEffect(() => {
    let cancelled = false;
    // Read after collect() resolves rather than in the effect body: this runs
    // in the same commit as the recorder that writes the boot event, and
    // reading first would miss it.
    collect().then(({ rows: r, missing: m }) => {
      if (cancelled) return;
      setRows(r);
      setMissing(m);
      setLog(readLog());
    });
    return () => {
      cancelled = true;
    };
  }, [collect]);

  return (
    <div className="wrap pb-8">
      <AppHeader left={<BackArrow />} title={<span className="eyebrow">Diagnostics</span>} />
      <h1 className="text-lg font-bold mb-4">診断</h1>

      <div className="card p-3" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button className="btn" onClick={refresh}>再読み込み</button>
        <button
          className="btn"
          disabled={!!busy}
          onClick={async () => {
            setBusy("sync");
            const r = await sync();
            setBusy("");
            alert(r.ok ? `同期OK 送信${r.pushed} 受信${r.pulled}` : `同期失敗: ${r.error}`);
            refresh();
          }}
        >
          {busy === "sync" ? "同期中…" : "今すぐ同期"}
        </button>
        <button
          className="btn btn-danger"
          disabled={!!busy}
          onClick={async () => {
            if (!confirm("この端末のデータベースを作り直します。曲やメモはMacから取り直します。端末内の音源は消えません。")) return;
            setBusy("reset");
            try {
              await resetLocalDatabase();
              window.location.href = "/";
            } catch (e) {
              setBusy("");
              alert("失敗: " + (e as Error).message);
            }
          }}
        >
          DBを作り直す
        </button>
        {missing.length > 0 && (
          <button
            className="btn btn-accent"
            disabled={!!busy}
            onClick={async () => {
              setBusy("media");
              const r = await fetchOfflineCopies(missing, (done, total) =>
                setBusy(`media:${done}/${total}`),
              );
              setBusy("");
              alert(
                r.failed
                  ? `${r.saved}件を保存しました。${r.failed}件は取得できませんでした（Macに繋がっていますか）。`
                  : `${r.saved}件を端末に保存しました。`,
              );
              refresh();
            }}
          >
            {busy.startsWith("media")
              ? busy.replace("media", "保存中 ").replace(":", "")
              : `音源を端末に入れ直す (${missing.length})`}
          </button>
        )}
      </div>

      {!rows ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>調べています…</p>
      ) : (
        <div className="card p-3">
          <table className="mono" style={{ fontSize: 11, width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: i ? "1px solid var(--line)" : undefined }}>
                  <td style={{ padding: "5px 8px 5px 0", color: "var(--muted)", whiteSpace: "pre" }}>{r.label}</td>
                  <td style={{ padding: "5px 0", color: r.bad ? "#ef8f7e" : "var(--fg)", wordBreak: "break-all" }}>
                    {r.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="text-sm font-bold" style={{ margin: "18px 0 6px" }}>
        できごと <span style={{ color: "var(--muted)", fontWeight: 400 }}>({log.length})</span>
      </h2>
      <p className="text-xs" style={{ color: "var(--muted)", marginBottom: 8 }}>
        この端末で起きたことの記録。新しいものが上。おかしなことが起きたら、ここをコピーして渡してください。
      </p>

      <div className="card p-3" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(formatLog(log));
              setBusy("copied");
              window.setTimeout(() => setBusy(""), 1200);
            } catch {
              alert("コピーできませんでした。下のテキストを長押しで選択してください。");
            }
          }}
        >
          {busy === "copied" ? "コピーしました" : "コピー"}
        </button>
        <button
          className="btn btn-danger"
          onClick={() => {
            if (!confirm("記録を消します。")) return;
            clearLog();
            setLog([]);
          }}
        >
          記録を消す
        </button>
      </div>

      {log.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>まだ何も記録されていません。</p>
      ) : (
        <div className="card p-3">
          <table className="mono" style={{ fontSize: 10, width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {[...log].reverse().map((e, i) => (
                <tr key={log.length - i} style={{ borderTop: i ? "1px solid var(--line)" : undefined }}>
                  <td style={{ padding: "4px 6px 4px 0", color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {new Date(e.t).toLocaleTimeString("ja-JP")}
                  </td>
                  <td
                    style={{ padding: "4px 6px 4px 0", color: "var(--muted)", whiteSpace: "nowrap" }}
                    title="どの文書が書いたか。値が変わっていればページが読み直されている"
                  >
                    {e.run}
                  </td>
                  <td
                    style={{
                      padding: "4px 6px 4px 0",
                      whiteSpace: "nowrap",
                      color: e.ev === "error" || e.ev.endsWith(".fail") ? "#ef8f7e" : "var(--fg)",
                    }}
                  >
                    {e.ev}
                  </td>
                  <td style={{ padding: "4px 0", color: "var(--muted)", wordBreak: "break-all" }}>
                    {e.d
                      ? Object.entries(e.d)
                          .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
                          .join(" ")
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
