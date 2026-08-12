"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import type { Note } from "@/lib/db/schema";
import { NOTE_TAGS, NOTE_TAG_LABEL } from "@/lib/constants";
import { fmtTime } from "@/lib/format";
import { addNote, deleteNote } from "@/app/actions";

export default function NotesSection({
  standardId,
  notes,
}: {
  standardId: number;
  notes: Note[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [tag, setTag] = useState("general");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    await addNote(standardId, { body, tag });
    setBody("");
    setTag("general");
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="card p-3">
        <textarea
          className="textarea"
          style={{ minHeight: 64 }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="学び・気づき・練習の注意点をメモ"
        />
        <div className="mt-2 flex items-center gap-2">
          <select className="select" style={{ width: "auto" }} value={tag} onChange={(e) => setTag(e.target.value)}>
            {NOTE_TAGS.map((t) => (
              <option key={t} value={t}>{NOTE_TAG_LABEL[t]}</option>
            ))}
          </select>
          <button className="btn btn-accent flex-1" disabled={busy} onClick={add}>
            メモを追加
          </button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="px-1 text-sm" style={{ color: "var(--muted)" }}>まだメモはありません。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.id} className="card p-3">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="chip">{NOTE_TAG_LABEL[n.tag ?? "general"] ?? n.tag}</span>
                {n.timestampSec !== null && (
                  <span className="chip" style={{ color: "var(--accent2)" }}>
                    <Clock size={12} strokeWidth={2} /> {fmtTime(n.timestampSec)}
                  </span>
                )}
                <button
                  className="ml-auto text-xs"
                  style={{ color: "var(--muted)" }}
                  onClick={async () => {
                    if (confirm("このメモを削除しますか？")) {
                      await deleteNote(n.id, standardId);
                      router.refresh();
                    }
                  }}
                >
                  削除
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
