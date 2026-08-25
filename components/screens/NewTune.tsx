"use client";

import ViewLink from "@/components/ViewLink";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { createStandard } from "@/lib/local/mutations";
import StatusPicker from "@/components/StatusPicker";
import { navigate } from "@/lib/nav";

export default function NewTune() {
  const [busy, setBusy] = useState(false);

  // Writes to this device first, so adding a tune works with no signal at all.
  async function submit(fd: FormData) {
    setBusy(true);
    const id = await createStandard(fd);
    if (id) navigate(`/standards/${id}`);
    else setBusy(false);
  }

  return (
    <div className="wrap pb-8">
      <div className="mb-4 flex items-center gap-3">
        <ViewLink href="/" className="back">
          <ArrowLeft size={15} strokeWidth={2} /> 戻る
        </ViewLink>
        <h1 className="text-lg font-bold">曲を追加</h1>
      </div>

      <form action={submit} className="card flex flex-col gap-3 p-4">
        <div>
          <label className="label">曲名 *</label>
          <input name="title" className="input" required autoFocus placeholder="Autumn Leaves" />
        </div>
        <div>
          <label className="label">作曲者</label>
          <input name="composer" className="input" placeholder="Joseph Kosma" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">キー(原曲)</label>
            <input name="key" className="input" placeholder="G minor" />
          </div>
          <div>
            <label className="label">構成</label>
            <input name="form" className="input" placeholder="AABC 32" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">フィール</label>
            <input name="feel" className="input" placeholder="med swing" />
          </div>
          <div>
            <label className="label">テンポ(BPM)</label>
            <input name="tempoBpm" type="number" inputMode="numeric" className="input" placeholder="140" />
          </div>
        </div>
        <div>
          <label className="label">ステップ</label>
          <StatusPicker />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="calledOften" value="1" />
          ジャムでよく呼ばれる（優先）
        </label>

        <button type="submit" className="btn btn-accent mt-1" disabled={busy}>
          {busy ? "追加中…" : "追加する"}
        </button>
      </form>
    </div>
  );
}
