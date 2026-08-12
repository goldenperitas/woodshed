# Woodshed 🎷

ジャズスタンダードを頭に叩き込むための個人用ポータル。
YouTube に散らばる音源・学びを 1 曲ごとにまとめ、**思い出す訓練（リコール・ドリル）**まで回す。

MacBook（常時起動）をサーバーにして、iPhone からブラウザ（PWA）で使う構成。クラウド課金なし・音源はローカルディスク直置き。

## できること

- **3ステップ管理** — S1 知ってる / S2 ヘッド弾ける / S3 ジャムで使える
- **音源**（1曲に複数） — 演奏者/年/編成つき、「基準」テイク指定
  - ゆっくり再生（**ピッチ維持**）、区間ループ、区間へのラベル（head/bridge…）
  - **タイムスタンプ付きメモ**（「1:32 のリハモが…」）
  - **オフライン保存**（IndexedDB） — 車・出先で圏外でも再生
- **コード解釈**（自由記述・自動保存）、**歌詞**（メロ記憶用）
- **メモ**（複数・タグ付き）
- **グループ** — 似た曲（リズムチェンジ族など）をまとめてドリル対象に
- **リコール・ドリル** 2モード
  - 曲名 → キー/構成/進行/メロを思い出す
  - ヘッドを聴く → 曲名を当てる（`head` 区間を使用）
  - 軽量スペースドリピティション（できた/むずい で次回間隔を調整）

## 技術

Next.js 16 (App Router) / SQLite + Drizzle / better-sqlite3 / Tailwind v4 / PWA

- DB: `./data/woodshed.db`（git 管理外）
- 音源: `./public/audio/`（git 管理外、HTTP Range 対応で Safari のシークOK）

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
