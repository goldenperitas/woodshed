"use client";

// The local database failing is the one error the app cannot paper over —
// nothing renders without it. The usual cause is a second tab: the OPFS
// backend takes exclusive handles on its files.
export default function LocalError({ error }: { error: Error }) {
  const contention = /Access Handle|another open/i.test(error.message);
  // Storage reclaimed by the OS with no way to fetch it back. Different from a
  // failure to open: nothing is wrong with this device, it simply has nothing
  // on it, and the fix is to be somewhere the Mac can be reached.
  const lost = error.message.includes("取り直せません");
  return (
    <div className="wrap" style={{ paddingTop: 40 }}>
      <div className="card p-4" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 className="text-base font-bold">
          {lost ? "この端末のデータが消えています" : "棚を開けられませんでした"}
        </h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {lost
            ? "iOSが使っていない間にストレージを回収したときに起こります。Macと同じネットワークに入って開き直せば、曲もメモも戻ります（音源は入れ直しが必要です）。"
            : contention
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
