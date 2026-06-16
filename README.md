# CareerSync AI

> 転職活動用 パーソナル企業分析＆選考管理ハブ

企業URLを1つ入力するだけで、Gemini AIが企業情報を自動収集・分析。スコアリング・比較・選考ステータス管理をすべて1つのダッシュボードで完結させる個人専用の「選考コマンドセンター」。

---

## このアプリでできること

- **URLを貼るだけでAI企業分析**: 事業概要・強み・弱み・面接対策が自動生成される
- **スコア比較**: 成長性・安定性・カルチャーフィット・WLB・待遇を5軸でレーダーチャート表示
- **横断比較ビュー**: 2〜4社をスプレッドシート風に並べて項目比較
- **選考ステータス管理**: 1クリックでステータス更新、進行状況が色で一目でわかる
- **面接対策クイックシート**: 想定問答をワンクリックコピー
- **メールスクショから自動登録**: 面接通知メールのスクショを貼るだけでスケジュールが自動登録される（フェーズ6）

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| バックエンド | Python 3.11+ / FastAPI |
| フロントエンド | HTML5 / Tailwind CSS (CDN) / Vanilla JS |
| データビジュアライゼーション | Chart.js |
| データベース | SQLite 3 |
| AI | Google Gemini 2.5 Flash |

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

## 開発フェーズ

| フェーズ | 内容 | 状態 |
|---|---|---|
| 0 | 環境構築 & プロジェクト基盤 | 完了 |
| 1 | データベース基盤（SQLite） | 完了 |
| 2 | バックエンドAPI基盤 | 完了 |
| 3 | AIインテグレーション | 完了 |
| 4 | UIプロトタイプ | 完了 |
| 5 | フロントエンドとAPI接続 | 完了 |
| 6 | メールスクショからスケジュール自動登録 | 完了 |
| 7 | 仕上げ・ドキュメント整備 | 進行中 |

---

## ライセンス

個人プロジェクト / 学習目的
