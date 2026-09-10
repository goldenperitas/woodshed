"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";

// A block of free text that reads as plain text and is edited deliberately:
// pencil to open the textarea, 保存 to close it. Auto-save was dropped because
// a permanent textarea clips anything taller than itself — a long chord chart
// ends up read through a 150px window.
export default function EditableText({
  title,
  value,
  onSave,
  placeholder,
  emptyLabel,
  draftKey,
  mono = false,
}: {
  title: string;
  value: string;
  onSave: (text: string) => Promise<void>;
  placeholder?: string;
  emptyLabel: string;
  draftKey: string;
  mono?: boolean;
}) {
  // Nothing is auto-saved now, so an accidental back-swipe mid-sentence would
  // throw the writing away. The draft outlives the unmount in sessionStorage
  // and reopens the editor where it left off. Read once, on mount: the tune
  // page only renders this after the local DB has answered, so there is no
  // server-rendered markup for it to disagree with.
  const storageKey = `woodshed:draft:${draftKey}`;
  const [draft] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });
  const resuming = draft !== null && draft !== value;

  const [editing, setEditing] = useState(resuming);
  const [text, setText] = useState(resuming ? draft : value);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLTextAreaElement | null>(null);

  // The editor grows with the text: what you are writing is never behind a
  // scrollbar either.
  function fit() {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }
  useEffect(() => {
    if (!editing) return;
    fit();
    // Rotating the phone or opening the keyboard rewraps the lines, so the
    // height it was fitted to is no longer the height it needs.
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [editing, text]);

  function open() {
    setText(value);
    setEditing(true);
    // Focus once the textarea exists, without stealing the scroll position.
    requestAnimationFrame(() => box.current?.focus({ preventScroll: true }));
  }

  function change(next: string) {
    setText(next);
    try {
      sessionStorage.setItem(storageKey, next);
    } catch {}
  }

  function dropDraft() {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {}
  }

  async function save() {
    setSaving(true);
    await onSave(text);
    dropDraft();
    setSaving(false);
    setEditing(false);
  }

  function cancel() {
    if (text !== value && !confirm("編集した内容を破棄しますか？")) return;
    dropDraft();
    setText(value);
    setEditing(false);
  }

  return (
    <>
      <div className="sec-head">
        <h4>{title}</h4>
        {!editing && (
          <button className="sec-head-btn" onClick={open} aria-label={`${title}を編集`}>
            <Pencil size={13} strokeWidth={2} /> {value ? "編集" : "書く"}
          </button>
        )}
      </div>

      {editing ? (
        <div>
          <textarea
            ref={box}
            className={mono ? "textarea textarea-grow mono" : "textarea textarea-grow"}
            value={text}
            placeholder={placeholder}
            onChange={(e) => change(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button className="btn btn-accent flex-1" disabled={saving} onClick={save}>
              {saving ? "保存中…" : "保存"}
            </button>
            <button className="btn btn-ghost" disabled={saving} onClick={cancel}>
              キャンセル
            </button>
          </div>
        </div>
      ) : value ? (
        <p className={mono ? "readtext mono" : "readtext"}>{value}</p>
      ) : (
        <button className="readtext-empty" onClick={open}>{emptyLabel}</button>
      )}
    </>
  );
}
