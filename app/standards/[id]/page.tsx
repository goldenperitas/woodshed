"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { accentFor } from "@/lib/sleeve";
import { saveChords, saveLyrics } from "@/lib/local/mutations";
import { getStandard } from "@/lib/local/queries";
import { useLocalQuery, useStandardId } from "@/lib/local/store";
import Booting from "@/components/Booting";
import LocalError from "@/components/LocalError";
import Woodshed from "@/components/Woodshed";
import AudioUploader from "@/components/AudioUploader";
import ArtworkUploader from "@/components/ArtworkUploader";
import AutoSaveText from "@/components/AutoSaveText";
import NotesSection from "@/components/NotesSection";
import ReviewLog from "@/components/ReviewLog";
import GroupsSection from "@/components/GroupsSection";
import EditStandard from "@/components/EditStandard";
import StatusQuickSet from "@/components/StatusQuickSet";
import DeleteStandardButton from "@/components/DeleteStandardButton";

export default function StandardPage() {
  const id = useStandardId();
  const { data, loading, error } = useLocalQuery(
    async () => (id ? getStandard(id) : null),
    [id],
  );

  if (error) return <LocalError error={error} />;
  if (loading || !id) return <Booting label="めくっています" />;
  if (!data) {
    // Shows the id it looked for: offline this page is rendered from a shared
    // cached shell, so "not found" usually means the wrong id was read from
    // the URL rather than that the tune is really missing.
    return (
      <div className="wrap" style={{ paddingTop: 40 }}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>この曲は見つかりませんでした。</p>
        <p className="mono" style={{ fontSize: 10, color: "var(--muted)", opacity: 0.6, marginTop: 6 }}>
          id: {id}
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
          <Link href="/" className="back" style={{ display: "inline-flex" }}>
            <ArrowLeft size={15} strokeWidth={2} /> 棚に戻る
          </Link>
          <button className="btn btn-ghost text-sm" onClick={() => window.location.reload()}>
            読み込み直す
          </button>
        </div>
      </div>
    );
  }

  const { standard: std, recordings, regions, notes, allGroups, memberGroupIds, reviews, now } = data;
  const accent = accentFor(std.title);

  return (
    <div className="room-ground" style={{ ["--accent" as string]: accent } as React.CSSProperties}>
      <div className="room">
        <div className="topbar">
          <Link href="/" className="back"><ArrowLeft size={15} strokeWidth={2} /> 棚に戻る</Link>
        </div>

        <Woodshed standard={std} recordings={recordings} regions={regions} />

        <section className="sec"><h4>音源を追加</h4>
          <AudioUploader standardId={std.id} />
        </section>

        <section className="sec"><h4>コード解釈</h4>
          <AutoSaveText initial={std.chordInterpretation ?? ""} onSave={saveChords.bind(null, std.id)}
            placeholder={"自分の言葉で。例:\nA: | Cm7 | F7 | BbM7 | ... |\nブリッジは全音下のトゥーファイブ…"} minHeight={150} />
        </section>

        <section className="sec"><h4>メモ</h4>
          <NotesSection standardId={std.id} notes={notes} />
        </section>

        <section className="sec"><h4>歌詞（メロディ記憶用）</h4>
          <AutoSaveText initial={std.lyrics ?? ""} onSave={saveLyrics.bind(null, std.id)}
            placeholder="歌詞を書いておくとメロが定着しやすい" minHeight={110} />
        </section>

        <section className="sec"><h4>ステータス</h4>
          <StatusQuickSet id={std.id} status={std.status} calledOften={std.calledOften === 1} />
        </section>

        <section className="sec"><h4>復習ログ</h4>
          <ReviewLog reviews={reviews} now={now} />
        </section>

        <section className="sec"><h4>ジャケット</h4>
          <ArtworkUploader standardId={std.id} artworkPath={std.artworkPath} />
        </section>

        <section className="sec"><h4>グループ</h4>
          <GroupsSection standardId={std.id} allGroups={allGroups} memberIds={[...memberGroupIds]} />
        </section>

        <section className="sec"><h4>基本情報</h4>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <EditStandard std={std} />
            <div style={{ marginLeft: "auto" }}><DeleteStandardButton id={std.id} title={std.title} /></div>
          </div>
        </section>
      </div>
    </div>
  );
}
