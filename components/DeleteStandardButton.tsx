"use client";

import { useTransition } from "react";
import { deleteStandard } from "@/app/actions";

export default function DeleteStandardButton({ id, title }: { id: number; title: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn btn-danger btn-ghost text-sm"
      disabled={pending}
      onClick={() => {
        if (confirm(`「${title}」を削除しますか？音源も消えます。`)) {
          start(() => deleteStandard(id));
        }
      }}
    >
      🗑 曲を削除
    </button>
  );
}
