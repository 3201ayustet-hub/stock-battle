# 株価成長バトル Ver.1.0

4人が選んだ日本株の成長率を、手入力した終値で比較する共有Webアプリです。

## 主な機能

- 4人固定、1人1銘柄
- 購入価格と日々の終値を手入力
- 成長率ランキング
- Chart.jsによる折れ線グラフ
- 過去データの修正・削除
- JSONバックアップ
- ログイン不要
- 共有URLを知っている人は全員閲覧・編集可能
- スマートフォン対応

## GitHubへ置くファイル

次の7ファイルをリポジトリの一番上に置いてください。

- index.html
- style.css
- app.js
- config.js
- config.example.js
- schema.sql
- README.md

## Supabase設定

Supabase SQL Editorで `schema.sql` を実行します。すでに実行済みなら、再実行は不要です。

## config.jsの設定

`config.js`を開き、次の2か所を書き換えます。

```js
window.APP_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabasePublishableKey: "YOUR_PUBLISHABLE_KEY"
};
```

- `supabaseUrl`：SupabaseのProject URL
- `supabasePublishableKey`：`sb_publishable_`で始まるPublishable key

Secret keyやservice_role keyは絶対に使用しないでください。

## GitHub Pages設定

GitHubリポジトリで次を設定します。

1. Settings
2. Pages
3. Source: Deploy from a branch
4. Branch: main
5. Folder: /(root)
6. Save

公開URLの例：

`https://ユーザー名.github.io/stock-battle/`

## 初回利用

公開URLを開き、対戦名・開始日・4人分の情報を登録します。作成後に発行される共有URLを4人へ送ってください。

## 注意事項

- URLを知っている人は全員編集できます。
- 配当、税金、手数料は計算に含みません。
- 株式分割・併合の自動補正はありません。
