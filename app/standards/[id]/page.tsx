import Link from "next/link";
import { notFound } from "next/navigation";
import { getStandard } from "@/lib/db/queries";
import { saveChords, saveLyrics } from "@/app/actions";
import Woodshed from "@/components/Woodshed";
import AudioUploader from "@/components/AudioUploader";
import ArtworkUploader from "@/components/ArtworkUploader";
import AutoSaveText from "@/components/AutoSaveText";
import NotesSection from "@/components/NotesSection";
import GroupsSection from "@/components/GroupsSection";
import EditStandard from "@/components/EditStandard";
import StatusQuickSet from "@/components/StatusQuickSet";
import DeleteStandardButton from "@/components/DeleteStandardButton";

export const dynamic = "force-dynamic";

export default async function StandardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = getStandard(Number(id));
  if (!data) notFound();
  const { standard: std, recordings, regions, notes, allGroups, memberGroupIds } = data;

  return (
    <div className="room-ground">
      <div className="room">
        <div className="topbar">
          <Link href="/" className="back">↩ 棚に戻る</Link>
          <StatusQuickSet id={std.id} status={std.status} calledOften={std.calledOften === 1} />
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
