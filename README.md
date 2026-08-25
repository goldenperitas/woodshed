# Woodshed 🎷

ジャズスタンダードを頭に叩き込むための個人用ポータル。
YouTube に散らばる音源・学びを 1 曲ごとにまとめ、**思い出す訓練（リコール・ドリル）**まで回す。

**ローカルファースト構成**。画面は端末内の SQLite (OPFS) から描画されるので、圏外でも全機能が動く。MacBook は「同期先」であって描画サーバーではない。音源は端末内にのみ置かれ、サーバーには一切上がらない。

## できること

- **3ステップ管理** — S1 知ってる / S2 ヘッド弾ける / S3 ジャムで使える
- **音源**（1曲に複数） — 演奏者/年/編成つき、「基準」テイク指定
  - ゆっくり再生（**ピッチ維持**）、区間ループ、区間へのラベル（head/bridge…）
  - **タイムスタンプ付きメモ**（「1:32 のリハモが…」）
  - **端末内保存**（IndexedDB） — 車・出先で圏外でも再生
- **コード解釈**（自由記述・自動保存）、**歌詞**（メロ記憶用）
- **メモ**（複数・タグ付き）
- **グループ** — 似た曲（リズムチェンジ族など）をまとめてドリル対象に
- **リコール・ドリル** 2モード
  - 曲名 → キー/構成/進行/メロを思い出す
  - ヘッドを聴く → 曲名を当てる（`head` 区間を使用）
  - 軽量スペースドリピティション（できた/むずい で次回間隔を調整）

## 技術

Next.js 16 (App Router) / SQLite + Drizzle / Tailwind v4 / PWA

### データの流れ

```
端末A                        Mac                       端末B
SQLite (OPFS/wasm)  ←─ /api/sync ─→  SQLite      ←─ /api/sync ─→  SQLite
音源 Blob (IndexedDB)         （メタデータのみ）        音源 Blob
```

- **描画元は常に端末内の SQLite**。サーバーが落ちていても圏外でも画面は出る
- 同期は**メタデータだけ**。曲名・コード解釈・メモ・リージョン・復習ログが対象
- **音源とジャケットは端末から出ない**。行が持つのは `local:<uuid>` という鍵だけで、
  バイト列は同期されない（端末ごとに入れ直す）
- 衝突解決は行単位の last-write-wins。ID は UUID なのでオフライン採番できる
- 削除は物理削除せずトゥームストーン（`deleted_at`）。でないと同期で復活する

| ファイル | 役割 |
| --- | --- |
| `lib/sync/schema.ts` | 端末と Mac が共有するテーブル定義 |
| `lib/sync/protocol.ts` | 同期の電文形式と衝突ルール |
| `lib/local/` | 端末側 DB・クエリ・書き込み・同期エンジン |
| `lib/server/db.ts` | Mac 側の同期ピア |
| `public/db-worker.js` | OPFS SQLite を動かす Worker（バンドラ外） |

- Mac 側 DB: `./data/woodshed.db`（git 管理外）
- 旧音源: `./public/audio/`（git 管理外。ローカルファースト化より前に上げた分。
  Mac に届く間はそのまま再生でき、`Save` で端末に取り込める）

### 既存DBの移行

整数IDからUUIDへの一度きりの変換。バックアップを自動で取る。

```
node scripts/migrate-to-uuid.js
```

## 起動

```bash
npm run dev
```

Mac 上で `http://localhost:3000`。音源のアップロードは Mac のブラウザでドラッグ＆ドロップが楽。

## iPhone から使う（PWA + オフライン）

オフライン保存と PWA インストールには **HTTPS（セキュアコンテキスト）が必須**。`http://<mac>.local` では Service Worker が動きません。**Tailscale Serve** で正式証明書つき HTTPS を通すのが簡単で、家の外（車・出先）からもアクセスできるようになります。

```bash
# Mac に Tailscale を入れ、iPhone にも同じ tailnet で入る
tailscale serve --bg 3000          # https://<mac-name>.<tailnet>.ts.net に 3000 を公開
tailscale serve status             # URL を確認
```

1. iPhone の Safari で上記 HTTPS URL を開く
2. 共有 → **ホーム画面に追加**（PWA インストール）
3. 各録音の「⬇ オフライン保存」で、練習中の曲だけ端末に保存

> iPhone はストレージ枠が有限なので、全曲ではなく **今練習中の曲だけ**保存するのが安定。

## メモ

- 本番ビルド: `npm run build && npm start`
- DB をブラウズ: `npx drizzle-kit studio`
