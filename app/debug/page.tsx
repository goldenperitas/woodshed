"use client";

// Diagnostics. Everything that makes this app work offline is invisible when
// it works and silent when it doesn't — the service worker, the caches, the
// device database, the sync cursor. Without somewhere to look, a bug report
// can only say "it didn't open", which is not enough to fix anything.
//
// Deliberately plain, and reachable offline (the service worker precaches it).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { rawAll, ready, getMeta, resetLocalDatabase } from "@/lib/local/db";
import { sync, lastSync, pendingCount } from "@/lib/local/sync";
import { SYNC_TABLES } from "@/lib/sync/schema";
import { listOfflineKeys, storageEstimate } from "@/lib/offline";

type Row = { label: string; value: string; bad?: boolean };

const KEY_ASSETS = ["/sqlite/sqlite3.wasm", "/db-worker.js", "/standards/_shell", "/"];

export default function DebugPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState("");

  const collect = useCallback(async (): Promise<Row[]> => {
    const out: Row[] = [];
    const push = (label: string, value: unknown, bad = false) =>
      out.push({ label, value: String(value), bad });

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

    return out;
  }, []);

  const refresh = useCallback(() => {
    collect().then(setRows);
  }, [collect]);

  useEffect(() => {
    let cancelled = false;
    collect().then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, [collect]);

  return (
    <div className="wrap pb-8">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/" className="back"><ArrowLeft size={15} strokeWidth={2} /> 戻る</Link>
        <h1 className="text-lg font-bold">診断</h1>
      </div>

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
    </div>
  );
}
