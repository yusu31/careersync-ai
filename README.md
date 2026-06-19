# CareerSync AI

> 転職活動用 パーソナル企業分析＆選考管理ハブ

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)](https://sqlite.org)
[![Gemini](https://img.shields.io/badge/Gemini-2.5_Flash-4285F4?logo=google&logoColor=white)](https://ai.google.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-CDN-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/License-Personal_Project-lightgrey)](LICENSE)

企業情報をExcel・PDF・スクショで一括取り込み、または URLを入力するだけで Gemini AI が自動分析。スコアリング・比較・選考ステータス管理をすべて1つのダッシュボードで完結させる個人専用の「選考コマンドセンター」。

---

## このアプリでできること

### 企業登録・AI分析
- **URLを貼るだけでAI企業分析**: 事業概要・強み・弱み・面接対策が自動生成される
- **Excel・PDF・スクショから一括取り込み**: ✦ボタンからファイルをアップロードするだけで複数企業をまとめて登録
- **一括AI分析**: 未分析企業をまとめて一気に分析（サイドバー下部のボタンから）
- **AIチャットで情報補完**: 企業選択中に✦ボタンを押して、求人票・面接メモ・URLを送るとAIが自動で情報を更新

### スコアリング・比較
- **5軸レーダーチャート**: 成長性・安定性・カルチャーフィット・WLB・待遇をビジュアル表示
- **横断比較ビュー（スコアタブ）**: 全企業をスプレッドシート風に並べてスコア比較、ヒートマップ付き
- **条件比較タブ**: 年収・勤務地・残業・通勤・賞与・福利厚生を横並びで比較
- **ランキングタブ**: 採用しやすさ・給与・通勤・WLB・キャリア・総合の7軸でランキング表示

### 個人最適化
- **通勤時間自動算出**: 郡山市字原中を起点に車・新幹線・電車など5手段の所要時間をGeminiが推定
- **採用可能性スコア**: ユーザープロフィール（未経験・現年収・希望職種）を反映したスコアリング
- **年収回復シミュレーション**: 転職後に現年収600万円へ戻るまでの目安年数を算出
- **初心者向け業務説明**: 「毎日実際に何をするか」をIT未経験者向けに平易な言葉で自動生成

### 選考管理
- **ステータス管理**: 検討中→書類応募→1次面接→2次面接→最終面接→内定→辞退
- **メールスクショから自動登録**: 面接通知メールのスクショをCtrl+Vで貼るだけで日時・形式・担当者を自動抽出
- **スケジュール一覧・結果記録**: 面接後に通過/不合格/待機中を記録
- **求人元タグ管理**: リクルートエージェント・doda・Wantedly等のタグを企業ごとに管理

---

## スクリーンショット

### ダッシュボード（選考状況の一覧）

![ダッシュボード全体](docs/images/01_dashboard.png)

### 企業詳細・5軸レーダーチャート

![企業詳細・レーダーチャート](docs/images/02_detail_radar.png)

### 企業詳細（AI分析・面接対策クイックシート）

![企業詳細・AI分析](docs/images/03_detail_another.png)

### 企業登録モーダル（URL入力→AI自動分析）

![企業登録モーダル](docs/images/04_modal_add_company.png)

### メールスクショからの面接スケジュール自動登録

![スケジュール自動登録](docs/images/05_modal_schedule_image.png)

### 操作デモ（企業選択→詳細表示→モーダル操作）

![操作デモ](docs/images/demo.gif)

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| バックエンド | Python 3.11+ / FastAPI |
| フロントエンド | HTML5 / Tailwind CSS (CDN) / Vanilla JS |
| データビジュアライゼーション | Chart.js |
| データベース | SQLite 3 |
| AI | Google Gemini 2.5 Flash |
| スクレイピング | BeautifulSoup4 |
| ファイル解析 | pdfplumber / python-docx / pandas |

---

## セットアップ手順

### 前提条件

- Python 3.11 以上がインストールされていること
- Gemini API キーを取得済みであること（[Google AI Studio](https://aistudio.google.com/) で無料取得可能）

### 1. リポジトリをクローン

```bash
git clone https://github.com/yusu31/CareerManagement.git
cd CareerManagement
```

### 2. Python仮想環境を作成・有効化

```bash
# 仮想環境の作成
python -m venv .venv

# 有効化（Windows PowerShell）
.\.venv\Scripts\Activate.ps1

# 有効化（Mac/Linux）
source .venv/bin/activate
```

### 3. 依存ライブラリをインストール

```bash
pip install -r requirements.txt
```

### 4. 環境変数を設定

プロジェクトルートに `.env` ファイルを作成:

```
GEMINI_API_KEY=ここにGemini APIキーを貼り付ける
```

### 5. サーバーを起動

```bash
uvicorn main:app --reload --port 8000
```

ブラウザで `http://localhost:8000` を開く。

---

## AI の動作仕様

### できること

- 企業URLを1つ入力するだけで **30以上の項目を自動抽出**（企業名・従業員数・業種・勤務地・年収・技術スタックなど）
- 成長性・安定性・カルチャーフィット・WLB・待遇の **5軸スコアを自動算出**（1〜10点）
- 想定される面接質問と回答例・面接対策アドバイスを **自動生成**
- Excel・PDF・スクショから **複数企業を一括抽出・登録**
- 面接通知メールのスクリーンショットを貼り付けるだけで **面接日時・形式・担当者を自動読取**
- ユーザーのプロフィール（居住地・現年収・希望職種）を反映した **個人最適化スコアリング**
- 求人票や面接メモをチャットに投げるだけで **企業情報を自動補完・更新**

### できないこと

- JavaScriptでのみ動作するサイト（SPAなど）は静的テキストの取得が困難な場合がある
  → その場合はGeminiが公開情報をもとに一般的な分析を補完するため、**そのまま使い続けられる**
- リアルタイムでの求人情報更新・通知
- 複数ユーザーの同時利用（個人専用設計）
- モバイル最適化（PC ブラウザでの利用を推奨）

### APIの利用制限（無料枠）

Gemini 2.5 Flash の無料枠は **1日20リクエスト/プロジェクト**。  
上限に達した場合は翌日（太平洋時間 0:00 = 日本時間 16〜17時頃）にリセットされます。  
一括分析で上限に達した場合はアプリが自動検知し、何社完了したかを通知します。

---

## トラブルシューティング

**Q: `"GEMINI_API_KEY が設定されていません"` というエラーが表示される**  
A: プロジェクトルートに `.env` ファイルを作成し、以下を記載してください。

```
GEMINI_API_KEY=AIzaここにAPIキーを貼り付ける
```

APIキーは [Google AI Studio](https://aistudio.google.com/) で無料取得できます。

---

**Q: `[WinError 10013]` または `[Errno 10048]` エラーが出る（ポート競合）**  
A: ポート 8000 が別のプロセスで使用されています。以下のコマンドで既存プロセスを確認・終了してください。

```powershell
# PIDを確認
netstat -ano | findstr ":8000"

# プロセスを終了（PIDは上記で確認した番号に置き換える）
Stop-Process -Id <PID> -Force
```

---

**Q: PowerShell で `.venv\Scripts\Activate.ps1` を実行すると「実行ポリシー」エラーが出る**  
A: 以下のコマンドを実行してから再試行してください。

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

**Q: AI分析で「スクレイピングに失敗しました」と表示される**  
A: 正常な動作です。一部のサイトはスクレイピングをブロックしています。  
その場合、GeminiがURLのドメイン情報と一般知識をもとに分析を行うため、**分析自体は続行できます**。  
精度を上げたい場合は、企業の採用ページのURLを入力してみてください。

---

**Q: 一括分析中に「APIの無料枠に達しました」と表示される**  
A: Gemini APIの1日20回制限に達しました。翌日（日本時間16〜17時頃）に自動リセットされます。  
完了した分の企業はすでに分析済みです。翌日に再度「一括分析」ボタンを押すと残りが分析されます。

---

## ライセンス

個人プロジェクト / 学習目的
