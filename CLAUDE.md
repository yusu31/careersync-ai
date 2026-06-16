# CareerSync AI — プロジェクトガイドライン

## プロジェクト概要

**CareerSync AI** は転職活動用の個人専用Webアプリ。企業URLを1つ入力するだけでGemini AIが自動分析し、スコアリング・比較・選考ステータスを一元管理できる「選考コマンドセンター」。

- 作成者: yusu31
- リポジトリ: https://github.com/yusu31/CareerManagement
- 開発開始: 2026年6月16日

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| バックエンド | Python 3.11+ / FastAPI |
| フロントエンド | HTML5 / Tailwind CSS (CDN) / Vanilla JS |
| データビジュアライゼーション | Chart.js (CDN) |
| データベース | SQLite 3 |
| AI | Google GenAI SDK (Gemini 1.5 Pro) |
| 外部連携（後期） | Google Calendar API |

---

## ポート管理（厳守）

| サービス | ポート |
|---|---|
| FastAPI（バックエンド兼フロントエンド配信） | **8000** |

FastAPIが静的ファイル（HTML/CSS/JS）も同一ポート8000で配信する。Dockerは使用しない（SQLiteのためDB用コンテナ不要）。

---

## 環境構築コマンド

```powershell
# 1. 仮想環境の作成（初回のみ）
python -m venv .venv

# 2. 仮想環境の有効化（毎回起動前に実行）
.\.venv\Scripts\Activate.ps1

# 3. 依存ライブラリのインストール（初回 or requirements.txt更新時）
pip install -r requirements.txt

# 4. 開発サーバー起動
uvicorn main:app --reload --port 8000
```

ブラウザで `http://localhost:8000` にアクセス。

---

## 環境変数（.envファイル）

プロジェクトルートに `.env` ファイルを作成し、以下を設定する（`.gitignore` 対象、絶対にコミットしない）:

```
GEMINI_API_KEY=AIza...（Google AI Studioで取得）
```

---

## ディレクトリ構成

```
CareerManagement/
├── config/settings.py       # 環境変数読み込み
├── database/
│   ├── connection.py        # SQLite接続
│   └── models.py            # テーブル定義
├── services/
│   ├── scraper.py           # Webスクレイピング
│   ├── ai_analyst.py        # Gemini API連携
│   └── calendar_sync.py     # Googleカレンダー（後期）
├── static/
│   ├── css/style.css        # カスタムCSS
│   └── js/app.js            # 非同期通信・Chart.js
├── templates/dashboard.html  # メインダッシュボード
├── docs/                    # 設計ドキュメント
├── prototype/               # 静的HTMLプロトタイプ
├── main.py                  # FastAPIエントリーポイント
├── requirements.txt
├── .env                     # APIキー（gitignore対象）
└── .gitignore
```

---

## GitHub ワークフロー（厳守）

### 原則: Issue → Branch → PR → Merge

```
1. 作業前に必ずGitHub Issueを作成
2. ブランチ命名: {type}/{説明}-#{Issue番号}
   例: feature/setup-environment-#1
3. コミットメッセージ: {type}: {日本語説明} Closes #{番号}
   例: feat: Python仮想環境とFastAPI基盤を構築 Closes #1
4. PRを作成してmainにマージ
5. ブランチ削除 & git pull
```

### 禁止事項
- `git push origin main`（直接プッシュ禁止）
- `git push --force`（強制プッシュ禁止）
- Issue・PRなしでの作業

---

## 開発フェーズ

| フェーズ | 内容 | 状態 |
|---|---|---|
| 0 | 環境構築 & プロジェクト基盤 | 完了 |
| 1 | データベース基盤（SQLite） | 完了 |
| 2 | バックエンドAPI基盤（FastAPI） | 完了 |
| 3 | AIインテグレーション（Gemini） | 未着手 |
| 4 | UIプロトタイプ（静的HTML） | 未着手 |
| 5 | フロントエンドとAPI接続 | 未着手 |
| 6 | Googleカレンダー連携 | 未着手 |
| 7 | 仕上げ・ドキュメント整備 | 未着手 |

---

## 応答・コメントのルール

- すべての説明・コメント・コミットメッセージは**日本語**で記述
- コードコメントは「なぜそうするか（WHY）」のみ記載（何をするかはコードが語る）
- 学習者向けに丁寧な説明を加えながら進める
