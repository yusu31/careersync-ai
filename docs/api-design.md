# API 設計書

CareerSync AI — FastAPI バックエンド API 仕様

---

## 概要

| 項目 | 内容 |
|---|---|
| ベース URL | `http://localhost:8000` |
| インタラクティブ仕様書 | `http://localhost:8000/docs` |
| フォーマット | JSON（`Content-Type: application/json`） |
| 認証 | なし（個人専用ローカルアプリ） |

---

## エラーレスポンス共通フォーマット

```json
{
  "detail": "エラーメッセージ（日本語）"
}
```

| ステータスコード | 意味 |
|---|---|
| 400 | 不正なリクエスト |
| 404 | リソースが見つからない |
| 409 | 競合（URL 重複など） |
| 502 | AI（Gemini）処理失敗 |

---

## システム

### `GET /health` — ヘルスチェック

**レスポンス例（200）**
```json
{ "status": "ok", "version": "0.1.0" }
```

---

## 企業管理 API

### `GET /api/companies` — 企業一覧取得

**クエリパラメータ**

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `status` | string | なし | 選考ステータスでフィルター |
| `sort_by` | string | `created_at` | ソート対象カラム |
| `order` | string | `desc` | `asc` または `desc` |

`sort_by` で指定できるカラム:  
`id`, `name`, `created_at`, `status`, `hiring_probability_score`, `tech_growth_score`, `career_growth_score`, `expected_first_salary`, `commute_time_car`

**レスポンス（200）**: 企業オブジェクトの配列（全フィールド含む）

---

### `POST /api/companies` — 企業登録

**リクエストボディ**

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `url` | string | ✅ | 企業URL（UNIQUE制約あり） |
| `name` | string | | 企業名 |
| `job_url` | string | | 求人票URL |
| `source` | string | | 求人媒体 |
| `notes` | string | | メモ |

**レスポンス（201）**: 作成した企業オブジェクト  
**エラー**: `409 Conflict`（URL重複）

---

### `GET /api/companies/{id}` — 企業詳細取得

**レスポンス（200）**: 企業オブジェクト（全フィールド）  
**エラー**: `404 Not Found`

---

### `PATCH /api/companies/{id}` — 企業情報部分更新

`null` または省略したフィールドは変更されない。

**リクエスト例**
```json
{
  "status": "1次面接",
  "notes": "技術面接あり。Python/FastAPI 重視。"
}
```

**レスポンス（200）**: 更新後の企業オブジェクト

---

### `DELETE /api/companies/{id}` — 企業削除

紐付いたスケジュールは `ON DELETE CASCADE` で自動削除。  
**レスポンス（204）**: なし

---

### `POST /api/companies/{id}/analyze` — AI企業分析

企業URLをスクレイピングし、Gemini AIで30以上の項目を分析してDBに保存する。

**処理フロー**
1. DBから企業URLとユーザープロフィールを取得
2. 企業サイトをスクレイピング（失敗時は空文字で続行）
3. Gemini AIに分析依頼
4. 結果をDBにUPDATE
5. 更新後の企業オブジェクトを返す

**レスポンス（200）**: 分析後の企業オブジェクト  
**エラー**: `502`（Gemini APIエラー / クォータ超過）

> **注意**: Gemini 2.5 Flash 無料枠は1日20リクエスト。`429` エラーは `502` にラップされて返る。

---

### `POST /api/companies/{id}/supplement` — AIチャット情報補完

テキスト・URL・ファイルを元に企業情報をAIが補完・更新する。

**リクエスト**: `multipart/form-data`

| フィールド | 型 | 説明 |
|---|---|---|
| `text` | string | 面接メモ・求人票テキスト等 |
| `urls` | string（JSON配列） | `["https://..."]` 形式 |
| `files` | UploadFile（複数可） | 画像・PDF・Word・Excel |

対応ファイル形式: `.jpg` / `.png` / `.gif` / `.webp` / `.pdf` / `.docx` / `.xlsx` / `.xls`

**レスポンス（200）**
```json
{
  "updated_fields": ["summary", "scores", "job_sources"],
  "company": { ...企業オブジェクト... }
}
```

> `job_sources` は上書きではなく既存リストとのマージ。`job_url` も自動抽出・更新される。

---

### `PATCH /api/companies/{id}/sources` — 求人元タグ更新

**リクエスト例**
```json
{ "job_sources": ["Wantedly", "Green"] }
```

**レスポンス（200）**: 更新後の企業オブジェクト

---

## AI一括取り込み API

### `POST /api/bulk-import/preview` — 一括取り込みプレビュー

ファイル・テキストから企業を抽出し、重複チェック付きのプレビューを返す。**DBへの保存は行わない。**

**リクエスト**: `multipart/form-data`

| フィールド | 型 | 説明 |
|---|---|---|
| `text` | string | テキスト情報 |
| `files` | UploadFile（複数可） | 画像・PDF・Excel・CSV・Word |

**レスポンス（200）**
```json
{
  "companies": [
    {
      "name": "株式会社サンプル",
      "url": "https://sample.co.jp",
      "salary": "400〜600万円",
      "status": "new",
      "existing_id": null
    },
    {
      "name": "既存企業",
      "url": "https://existing.co.jp",
      "status": "update",
      "existing_id": 5
    }
  ]
}
```

`status`: `"new"`（新規）または `"update"`（既存企業にマージ）

---

### `POST /api/bulk-import/register` — 一括登録実行

プレビューで確認した企業リストをDBに登録・マージする。

**リクエスト**
```json
{
  "companies": [
    { "name": "株式会社サンプル", "url": "https://sample.co.jp", "salary": "400〜600万円" },
    { "name": "既存企業", "existing_id": 5, "salary": "500〜700万円" }
  ]
}
```

- `existing_id` なし → 新規INSERT（`url` 未指定時はUUID付きダミーURLを自動生成）
- `existing_id` あり → 既存企業の null フィールドのみマージ（上書きしない）

**レスポンス（200）**
```json
{ "inserted": 3, "updated": 1 }
```

---

## スケジュール管理 API

### `GET /api/schedules` — スケジュール一覧取得

**クエリパラメータ**

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `company_id` | integer | なし | 特定企業の面接のみ取得 |
| `upcoming` | boolean | `false` | 未来の予定のみ返す |

**レスポンス例（200）**
```json
[
  {
    "id": 1,
    "company_id": 3,
    "company_name": "株式会社サンプル",
    "event_title": "1次面接",
    "start_time": "2026-07-01T14:00:00",
    "interview_format": "オンライン",
    "result": null
  }
]
```

---

### `POST /api/schedules` — スケジュール登録

**リクエストボディ**

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `company_id` | integer | ✅ | 企業ID |
| `event_title` | string | ✅ | 例: 1次面接 |
| `start_time` | string | ✅ | ISO 8601形式 |
| `interview_format` | string | | 対面 / オンライン |
| `interviewer` | string | | 面接官名・部署 |
| `interview_notes` | string | | 事前メモ |

**レスポンス（201）**: 作成したスケジュールオブジェクト

---

### `PATCH /api/schedules/{id}` — スケジュール更新（結果記録）

**リクエスト例**
```json
{ "result": "通過", "interview_notes": "技術質問中心。コードレビュー経験を聞かれた。" }
```

**レスポンス（200）**: 更新後のスケジュールオブジェクト

---

### `DELETE /api/schedules/{id}` — スケジュール削除

**レスポンス（204）**: なし

---

## 画像解析 API

### `POST /api/extract-schedule` — メールスクショからスケジュール抽出

面接通知メールのスクリーンショットをGemini Visionで解析し、日時・企業・形式を自動抽出する。

**リクエスト**: `multipart/form-data`

| フィールド | 型 | 説明 |
|---|---|---|
| `image` | UploadFile | スクリーンショット画像（PNG/JPG） |

**レスポンス（200）**
```json
{
  "company_id": 3,
  "company_name": "株式会社サンプル",
  "event_title": "1次面接（オンライン）",
  "start_time": "2026-07-01T14:00:00",
  "interview_format": "オンライン",
  "interviewer": "人事部 田中様"
}
```

---

## 通勤時間算出 API

### `POST /api/commute/{id}` — 通勤時間算出

郡山市字原中を起点に、指定企業の勤務地までの通勤時間をGeminiが推定する。

**レスポンス（200）**
```json
{
  "commute_data": "{\"car\": 55, \"train\": 90, ...}",
  "company": { ...更新後の企業オブジェクト... }
}
```

---

## ユーザープロフィール API

### `GET /api/profile` — プロフィール取得

**レスポンス例（200）**
```json
{
  "id": 1,
  "home_address": "福島県郡山市字原中",
  "commute_mode": "car",
  "current_salary": 600,
  "experience_years": 0,
  "desired_role": "バックエンドエンジニア（自社開発・受託）",
  "ng_keywords": ["SES", "コールセンター", "携帯販売", "テレアポ"]
}
```

---

### `PATCH /api/profile` — プロフィール更新

**リクエスト例**
```json
{
  "experience_years": 1,
  "current_skills": "[\"Python\", \"FastAPI\"]"
}
```

**レスポンス（200）**: 更新後のプロフィールオブジェクト

---

## 選考ステータスの遷移

```
検討中 → 書類応募 → 1次面接 → 2次面接 → 最終面接 → 内定 → 辞退
```

`PATCH /api/companies/{id}` の `status` フィールドで更新する。
