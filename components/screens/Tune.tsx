"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import ViewLink from "@/components/ViewLink";
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

// Screens are swapped without a document load, so nothing resets the scroll
// on its own. Fires before paint, hence layout rather than a plain effect.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function Tune() {
  const id = useStandardId();
  const { data, loading, error } = useLocalQuery(
    async () => (id ? getStandard(id) : null),
    [id],
  );

  // A tune always opens at the top — once, when its page first commits. Later
  // re-queries (saving a memo, adding a take) must leave the reader where they
  // are, which is why this is keyed on the tune rather than on every load.
  const opened = useRef<string | null>(null);
  useIsoLayoutEffect(() => {
    if (!id || loading || opened.current === id) return;
    opened.current = id;
    window.scrollTo(0, 0);
  }, [id, loading]);

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
          <ViewLink href="/" className="back" style={{ display: "inline-flex" }}>
            <ArrowLeft size={15} strokeWidth={2} /> 棚に戻る
          </ViewLink>
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
          <ViewLink href="/" className="back"><ArrowLeft size={15} strokeWidth={2} /> 棚に戻る</ViewLink>
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
