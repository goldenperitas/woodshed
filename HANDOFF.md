# 引き継ぎ — Woodshed ローカルファースト化

前任者からの引き継ぎ。**未解決のバグが1件**あり、再現手段は用意してある。

まず `README.md` の「データの流れ」を読むこと。ここではそこに書いていない
「今どうなっているか」「何を壊してはいけないか」だけを書く。

---

## 1. いま何が起きたのか

サーバーレンダリングのアプリを、**端末内 SQLite (OPFS/wasm) から描画する
ローカルファースト構成**に全面移行した。Mac は `/api/sync` の同期ピアに降格。
目的は2つ:

- 圏外でも全機能が動く
- 音源をサーバーに置かない（他人に使わせる場合の法的要件。詳細は §5）

関連コミット（新しい順）:

| コミット | 内容 |
| --- | --- |
| `764350f` | オフラインテストハーネス、診断画面への導線、SWのシェル保存条件を修正 |
| `7664ee7` | 検証できなかったSW変更を撤回、`/debug` 追加 |
| `aa07b5e` | 曲IDが遷移に追従しない問題を修正 |
| `36b80b1` | 一覧が0件になる問題、ジャケ写が出ない問題を修正 |
| `2c02e45` | ローカルファースト化本体 |

---

## 2. 未解決バグ（最優先）

### 症状

圏外で、**一覧から「まだ一度も開いたことがない曲」のリンクを押すと、
直前に開いた曲のURLに着地する**。結果、前の曲の画面が表示される。

実機（iPhone PWA）でユーザーが報告した症状と一致する。ユーザー報告では
「見つかりませんでした」も出ていたが、それは修正済みの別要因（§3）。

### 再現手順

```bash
npm run build
npx next start -p 3100        # 別ターミナルで起動したまま
node scripts/offline-test.js
```

現在の出力（`764350f` 時点）:

```
--- offline ---
PASS  wall opens offline  — count=81
   [nav] want=/standards/72148163-… links=1 / -> /standards/72148163-…
PASS  tune A opens offline  — 'Round Midnight @ /standards/72148163-…
PASS  back to the wall  — count=81
   [nav] want=/standards/5815763c-… links=1 / -> /standards/72148163-…
FAIL  tune B (never opened online) opens offline  — 'Round Midnight @ /standards/72148163-…
FAIL  tune B is a different tune from A  — 'Round Midnight vs 'Round Midnight
PASS  tune A still works after B  — 'Round Midnight -> 'Round Midnight
```

`want=` と着地先の `->` が食い違っているのが本体。リンクは見つかっており
（`links=1`）、クリックも成功している。**URLだけが別物になる。**

### 最有力の仮説（未検証）

`public/sw.js` の文書フォールバックが、**曲Aのときにキャッシュした Response を
そのまま曲Bのナビゲーションに返している**。

```js
// public/sw.js — オフライン時のフォールバック
const shell = await caches.match(documentKey(url));   // documentKey は全曲共通で "/standards/_shell"
if (shell) return shell;
```

キャッシュされた Response は `Response.url` として**曲AのURL**を持っている。
ナビゲーションに対して別URLを持つ Response を返すと、ブラウザはリダイレクト
同様に扱い、**文書のURLを Response 側のURLに合わせる**。これなら
「Bを押したのにAのURLに着地する」が完全に説明できる。

確認方法（1行）: SW のフォールバック直前で `shell.url` をログに出し、
要求されたURLと一致しているか見る。一致していなければ仮説は正しい。

修正方針: キャッシュしたものをそのまま返さず、**URLを持たない Response に
作り直して返す**。

```js
const shell = await caches.match(documentKey(url));
if (shell) {
  return new Response(await shell.blob(), {
    status: shell.status,
    headers: shell.headers,
  });
}
```

※ この修正案自体もまだ検証していない。必ず `npm run test:offline` で
確認すること。

### 直したあと必ず確認すること

`scripts/offline-test.js` が **全項目 PASS** になること。特に:

- `tune B is a different tune from A` — これが通らないと直っていない
- `tune B ... opens offline` の `@ /standards/…` が **want と一致**すること

---

## 3. すでに直したもの（再発させないこと）

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| 一覧が0曲になる | 圏外の遷移がフルページ読み込みに落ち、前の文書のWorkerがOPFSハンドルを掴んだまま次が起動 | `pagehide` でプールを明け渡し、次のクエリで開き直す（`public/db-worker.js`） |
| 曲→曲で前の曲が出る | ページが再マウントされず、URLからIDを読むeffectが再実行されない。`pushState` は `popstate` を発火しない | `usePathname()` を依存に追加（`lib/local/store.ts`） |
| 一瞬「見つかりません」 | ID確定前の `null` を結果として描画 | クエリ結果に入力キーを持たせる（`lib/local/store.ts`） |
| ジャケ写が消える | SWのバージョンを上げるとキャッシュ全消し | ジャケットを `woodshed-media` に分離（`public/sw.js`） |
| 曲ページに生のRSCペイロードが表示 | Nextの先読みペイロードをシェルとして保存 | `isDocumentResponse()` でHTML文書のみ保存 |
| 別タブがあるとアプリが開けない | Web Lock を必須条件にしていた。bfcacheで凍結された文書がロックを保持したままになりうる | ロックは助言的な待ち合わせに変更。可否はアクセスハンドルで判定 |

---

## 4. 壊してはいけない不変条件

- **音源・ジャケットをサーバーに保存しない。** 行が持つのは `local:<uuid>` の
  鍵だけ。ここを崩すとオフライン設計と法的整理が同時に壊れる（§5）
- **物理削除しない。** 必ず `deleted_at` のトゥームストーン。`DELETE` すると
  同期で復活する
- **IDはUUID。** 連番に戻すとオフライン採番が衝突する
- **プル用カーソルは `server_seq`（サーバー採番）。** 端末時計の `updated_at` を
  使うと時計ズレで行を取りこぼす
- **OPFSは SAHPool VFS 固定。** 既定の `opfs` VFS や SQLocal は COOP/COEP
  ヘッダを要求する。SAHPoolだけが不要（実測確認済み）
- **DB接続はモジュールスコープのシングルトン。** effect内でWorkerを作ると
  StrictModeの二重マウントで壊れる（`lib/local/db.ts`）
- **`assertNotSilentlyEmpty()` を外さない。** 空のDBを「0件の棚」として
  描画しないための安全弁。トゥームストーンで総行数は単調増加するので
  「前はあったのに0」は異常と断定できる

---

## 5. 法的な前提（設計制約）

音源をサーバーに置かない構成は、単なる設計判断ではなく要件。

日本では MYUTA事件（東京地判 平19.5.25）で、ユーザーが自分の音源をアップロード
し自分だけがダウンロードするサービスについて、**運営者が複製・送信可能化の
主体**と認定されている。ロクラクII（最判 平23.1.20）・まねきTV（最判 平23.1.18）
も同方向。**アカウントごとにデータを分離しても防御にならない。**

サーバーが預かるのはメタデータのみ、という現在の形はこの論点から外れるための
もの。音源をサーバー保存に戻す変更を入れる場合は、必ずユーザーに確認すること。

---

## 6. 開発環境の重要な制約

### エージェントのブラウザでは Service Worker を登録できない

`mcp__Claude_Browser__*` のブラウザは、**空の1行 SW ですら登録に失敗する**:

```
TypeError: Failed to register a ServiceWorker ...
An unknown error occurred when fetching the script.
```

`scope` や `type` を変えても同じ。`navigator.serviceWorker` は存在し、
`isSecureContext` も true、`/sw.js` の fetch も 200。ブラウザ側の制約。
`mcp__claude-in-chrome__*`（実Chrome）も未接続で使えなかった。

**だから `scripts/offline-test.js` がある。** SW に手を入れたら必ずこれで
確認すること。前任者はこれを作る前に推測でSWを変更し、実機のナビゲーションを
壊した（`7664ee7` で撤回）。**検証できない変更を「修正」として出さないこと。**

なお SW 以外（DB・同期・画面遷移・クエリ）はエージェントのブラウザで
問題なく検証できる。

### アサーションを緩くしない

初版のテストは、**画面にRSCペイロードが生表示されている状態を PASS と
報告した**。「エラーが出ていない」は「動いている」ではない。
`scripts/offline-test.js` の `tuneState()` が何を弾いているか見てから緩めること。

---

## 7. 実機での確認手順

SWのバージョンを上げたら（`public/sw.js` の `CACHE`）、必ず:

1. **オンラインで** PWA を開く
2. アプリスイッチャーから**落とす**
3. 開き直す
4. 一覧最下部の「診断」→ `SW 状態: activated` / `SW 制御下: yes` を確認
5. オンラインのまま各画面を一巡（一覧は下までスクロール）。診断で4つの
   アセットが全部「あり」になれば準備完了
6. 機内モード ON → アプリを落とす → 起動

`/debug` には再同期と「DBを作り直す」がある。作り直しは安全（メタデータは
Macから、音源はIndexedDBに残る）。

---

## 8. 残タスク

1. **§2 のバグ修正**（最優先）
2. 認証。現在は誰でも `/api/sync` を叩ける。他人に使わせるならここが必須
3. オフラインの画面遷移がフルページ読み込みに落ちる件。動作はするが遅い。
   Nextは RSC レスポンスに `Vary: next-router-state-tree` を付けるため
   通常のキャッシュが当たらない。正規化キーで保存する案を一度入れたが、
   実機でナビゲーションが止まったため撤回済み（`7664ee7`）。
   **再挑戦するなら必ず `npm run test:offline` で確認してから**
4. `data/woodshed-pre-uuid-*.db` は移行前のバックアップ。しばらく残す

---

## 9. 状態メモ

- 実データ移行済み: 81曲 / 音源20件 / 復習ログ1件（`scripts/migrate-to-uuid.js`、再実行可）
- `scripts/import-standards.js` はユーザーの未追跡ファイル。コミットしないこと
- ポート3000でユーザーが `next start` を動かしている可能性がある。
  検証には3100を使う
