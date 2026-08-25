"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteStandard } from "@/lib/local/mutations";

export default function DeleteStandardButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className="btn btn-danger btn-ghost text-sm"
      disabled={pending}
      onClick={() => {
        if (confirm(`「${title}」を削除しますか？音源も消えます。`)) {
          // The old server action redirected; navigation is ours to do now.
          start(async () => {
            await deleteStandard(id);
            router.push("/");
          });
        }
      }}
    >
      <Trash2 size={15} strokeWidth={2} /> 曲を削除
    </button>
  );
}
