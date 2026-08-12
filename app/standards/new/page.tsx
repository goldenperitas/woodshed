import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createStandard } from "@/app/actions";
import { STATUS } from "@/lib/constants";

export default function NewStandardPage() {
  return (
    <div className="wrap pb-8">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/" className="btn btn-ghost">
          <ArrowLeft size={15} strokeWidth={2} /> 戻る
        </Link>
        <h1 className="text-lg font-bold">曲を追加</h1>
      </div>

      <form action={createStandard} className="card flex flex-col gap-3 p-4">
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
          <select name="status" className="select" defaultValue={1}>
            {([1, 2, 3] as const).map((s) => (
              <option key={s} value={s}>
                {STATUS[s].short} {STATUS[s].label} — {STATUS[s].hint}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="calledOften" value="1" />
          ジャムでよく呼ばれる（優先）
        </label>

        <button type="submit" className="btn btn-accent mt-1">
          追加する
        </button>
      </form>
    </div>
  );
}
