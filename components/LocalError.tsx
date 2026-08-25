"use client";

// The local database failing is the one error the app cannot paper over —
// nothing renders without it. The usual cause is a second tab: the OPFS
// backend takes exclusive handles on its files.
export default function LocalError({ error }: { error: Error }) {
  const contention = /Access Handle|another open/i.test(error.message);
  return (
    <div className="wrap" style={{ paddingTop: 40 }}>
      <div className="card p-4" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 className="text-base font-bold">棚を開けられませんでした</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {contention
            ? "別のタブでWoodshedが開いています。そちらを閉じてから再読み込みしてください。"
            : "ローカルデータベースの初期化に失敗しました。"}
        </p>
        <pre
          className="text-xs"
          style={{ color: "var(--muted)", whiteSpace: "pre-wrap", opacity: 0.7 }}
        >
          {error.message}
        </pre>
        <button className="btn" onClick={() => window.location.reload()}>
          再読み込み
        </button>
      </div>
    </div>
  );
}
