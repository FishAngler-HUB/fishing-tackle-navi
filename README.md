# 釣りタックルナビ

Japanese fishing tackle navigator — single-file HTML/CSS/JS web app that helps beginners
choose tackle by fishing type.

## ファイル構成

- `釣りタックルナビ.html` — アプリ本体（自己完結、画像はすべてbase64埋め込み）
  - ダブルクリックでブラウザ表示可能。ビルド不要、サーバー不要
  - ファイルサイズは約647KB（画像埋め込みのため）

## 主な機能

- 10種類の釣り方に対応：エギング・アジング・メバリング・シーバス・
  ライトショアジギング・ショアジギング・チニング・ロックフィッシュ・
  バス釣り・サビキ釣り
- 各釣り方に3段階のレベル（初心者向け／標準／本格派）をトグルで切り替え
- 各レベルで5項目のタックル仕様（ロッド・リール・メインライン・
  ショックリーダー・ルアー/仕掛け）＋メモを表示
- 釣り方ごとの持ち物チェックリスト、レベル別のコツ

## データ構造

`const fishingTypes = [...]` というJS配列にすべてのデータが入っている。

```js
{
  id, name, targetFish, shortDesc, icon,
  checklist: [],
  levels: {
    beginner:  { rod, reel, line, leader, lure },
    standard:  { ... },
    advanced:  { ... }
  },
  tips: { beginner: "", standard: "", advanced: "" } // 単一文字列でも可
}
```

各スペック項目は `{ value:"...", power:"ML"(任意), note:"..." }` の形。

`icon` キーは `const icons = {...}`（base64画像）のキーと対応。

## 新しい釣り方を追加する場合

`fishingTypes` 配列に必要な項目をすべて含むオブジェクトを追加するだけで、
一覧グリッドと詳細ビューの両方に自動で反映される（他のコード変更は不要）。

## デザインシステム（CSS変数）

```css
--navy:#0B2A44; --navy-deep:#081D33; --blue:#1E6FA6; --blue-light:#5FA8D3;
--sky:#EAF3FA; --sky-soft:#F5FAFD; --paper:#FFFFFF; --accent:#FF7A45;
--ink:#152431; --mist:#63788A; --hair:#E1EAF1; --page-bg:#E7F1F7;
--container:1160px; --radius-lg:20px; --radius-md:14px;
```

## レイアウト構造（概要）

```
<body>
  <div class="hero-shell">           ← 浮遊カード風のコンテナ
    <header class="site-header">     ← ナビゲーション
    <section class="hero">
      <div class="hero-flex">        ← PC:横並び / モバイル:縦並び（orderで制御）
        <div class="hero-copy">      ← 見出し・説明・CTA・統計
        <div class="hero-media">     ← イラスト画像
  </div>
  <main>
    <section class="picker">        ← 釣り方選択グリッド
    <section class="detail">        ← 選択後に表示される詳細（レベル切替＋スペック）
    <section class="info-block">    ← 使い方3ステップ
    <section class="about-block">   ← サイト概要
  </main>
  <footer>
```

## レスポンシブブレークポイント

- 一覧グリッド：2列（デフォルト）→ 3列（600px以上）→ 4列（980px以上）
- ヒーロー：縦積み（760px未満）→ 横並び（760px以上）
- 詳細スペックグリッド：1列 → 2列（640px以上）
- すべてのグリッドで `minmax(0,1fr)` を使用（日本語テキストのはみ出し防止）

## 既知の注意点

- カード名の見出しは `word-break:keep-all` を使用。長い英字混じりの名前
  （「ライトショアジギング」など）は `nameWithBreak()` ヘルパーで `<wbr>` を
  明示的に挿入している
- ヒーロー見出しは `white-space:nowrap` を使わない自然な折り返し方式
  （2026年8月に横並びレイアウトへ変更した際、強制改行を撤廃）

## これまでの主な修正履歴

1. CSS Gridのはみ出し修正（`repeat(N,1fr)` → `repeat(N,minmax(0,1fr))`）
2. カード名の孤立文字修正（`word-break:keep-all` + 明示的な `<wbr>`）
3. ヒーローセクションをPC/モバイルとも「文字とイラストが重ならない」
   左右フレックスレイアウトに刷新（絶対配置＋グラデーション方式から変更）

## 開発時の確認事項

- 360〜1920px幅で横スクロールが発生しないか（一覧・詳細ビュー両方）
- JSの構文エラーがないか、HTMLタグの対応が取れているか
