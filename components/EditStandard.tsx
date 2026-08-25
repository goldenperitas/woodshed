"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import type { Standard } from "@/lib/sync/schema";
import { updateStandardMeta } from "@/lib/local/mutations";

export default function EditStandard({ std }: { std: Standard }) {
  const [open, setOpen] = useState(false);

  async function onSubmit(fd: FormData) {
    await updateStandardMeta(std.id, fd);
    setOpen(false);
  }

  if (!open) {
    return (
      <button className="btn btn-ghost text-sm" onClick={() => setOpen(true)}>
        <Pencil size={15} strokeWidth={2} /> 基本情報を編集
      </button>
    );
  }

  return (
    <form action={onSubmit} className="card flex flex-col gap-3 p-4">
      <div>
        <label className="label">曲名 *</label>
        <input name="title" className="input" required defaultValue={std.title} />
      </div>
      <div>
        <label className="label">作曲者</label>
        <input name="composer" className="input" defaultValue={std.composer ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">キー(原曲)</label>
          <input name="key" className="input" defaultValue={std.key ?? ""} />
        </div>
        <div>
          <label className="label">構成</label>
          <input name="form" className="input" defaultValue={std.form ?? ""} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">フィール</label>
          <input name="feel" className="input" defaultValue={std.feel ?? ""} />
        </div>
        <div>
          <label className="label">テンポ(BPM)</label>
          <input
            name="tempoBpm"
            type="number"
            inputMode="numeric"
            className="input"
            defaultValue={std.tempoBpm ?? ""}
          />
        </div>
      </div>
      <input type="hidden" name="status" value={std.status} />
      <input type="hidden" name="calledOften" value={std.calledOften ? "1" : ""} />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-accent flex-1">
          保存
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          キャンセル
        </button>
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        ※ ステップ／頻出は上のボタンで変更できます
      </p>
    </form>
  );
}
