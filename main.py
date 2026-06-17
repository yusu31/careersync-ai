"""
CareerSync AI — FastAPI エントリーポイント

`uvicorn main:app --reload --port 8000` で起動する。
このファイルがアプリ全体の玄関口であり、全APIエンドポイントを定義する。
"""

import json
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from database.models import init_db
from database.connection import get_connection
from services.scraper import scrape_company
from services.ai_analyst import analyze_company
from services.schedule_extractor import extract_schedule_from_image
from services.info_supplement import supplement, UploadedFile, _EXT_TO_MIME


# ─────────────────────────────────────────────
# アプリ起動・終了時のライフサイクル管理
# ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """起動時にDBを初期化する。shutdown 時の処理はここに追加できる。"""
    init_db()
    yield


# ─────────────────────────────────────────────
# FastAPI インスタンス
# ─────────────────────────────────────────────

app = FastAPI(
    title="CareerSync AI",
    description="転職活動用 パーソナル企業分析＆選考管理ハブ",
    version="0.1.0",
    lifespan=lifespan,
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# ─────────────────────────────────────────────
# Pydantic スキーマ（リクエスト/レスポンスの型定義）
# ─────────────────────────────────────────────

class CompanyCreate(BaseModel):
    url: str
    name: Optional[str] = None
    job_url: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None


class CompanyUpdate(BaseModel):
    """PATCH 用。None フィールドはそのまま無視する。"""
    name: Optional[str] = None
    job_url: Optional[str] = None
    industry: Optional[str] = None
    employees: Optional[str] = None
    founded_year: Optional[int] = None
    listing_status: Optional[str] = None
    development_type: Optional[str] = None
    location: Optional[str] = None
    commute_time_car: Optional[int] = None
    commute_time_shinkansen: Optional[int] = None
    commute_allowance: Optional[str] = None
    work_style: Optional[str] = None
    overtime_hours: Optional[int] = None
    paid_leave_rate: Optional[int] = None
    transfer: Optional[str] = None
    salary: Optional[str] = None
    bonus: Optional[str] = None
    expected_first_salary: Optional[int] = None
    salary_upper: Optional[int] = None
    years_to_recover: Optional[float] = None
    inexperienced_ok: Optional[int] = None
    training_program: Optional[str] = None
    hiring_probability_score: Optional[int] = None
    job_description: Optional[str] = None
    skill_stack: Optional[str] = None
    tech_growth_score: Optional[int] = None
    career_growth_score: Optional[int] = None
    career_path: Optional[str] = None
    benefits: Optional[str] = None
    summary: Optional[str] = None
    strengths_weaknesses: Optional[str] = None
    interview_strategy: Optional[str] = None
    scores: Optional[str] = None
    status: Optional[str] = None
    source: Optional[str] = None
    applied_at: Optional[str] = None
    notes: Optional[str] = None
    motivation: Optional[str] = None


class ScheduleCreate(BaseModel):
    company_id: int
    event_title: str
    start_time: str
    interview_format: Optional[str] = None
    interviewer: Optional[str] = None
    interview_notes: Optional[str] = None


class ScheduleUpdate(BaseModel):
    event_title: Optional[str] = None
    start_time: Optional[str] = None
    interview_format: Optional[str] = None
    interviewer: Optional[str] = None
    interview_notes: Optional[str] = None
    result: Optional[str] = None
    google_event_id: Optional[str] = None


class UserProfileUpdate(BaseModel):
    home_address: Optional[str] = None
    commute_mode: Optional[str] = None
    current_salary: Optional[int] = None
    experience_years: Optional[int] = None
    current_skills: Optional[str] = None
    desired_role: Optional[str] = None
    ng_keywords: Optional[str] = None


class ScheduleFromImage(BaseModel):
    image_base64: str
    mime_type: str = "image/png"


# ─────────────────────────────────────────────
# ヘルパー関数
# ─────────────────────────────────────────────

def row_to_dict(row) -> dict:
    """sqlite3.Row を通常の dict に変換する。"""
    return dict(row)


# ─────────────────────────────────────────────
# ヘルスチェック
# ─────────────────────────────────────────────

@app.get("/health", tags=["system"])
async def health_check():
    """サーバー稼働確認エンドポイント。"""
    return {"status": "ok", "version": "0.1.0"}


# ─────────────────────────────────────────────
# ダッシュボード（後でHTMLを返す）
# ─────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def root(request: Request):
    """ルートURL。ダッシュボードHTMLを返す。"""
    return templates.TemplateResponse("dashboard.html", {"request": request})


# ─────────────────────────────────────────────
# 企業管理 API
# ─────────────────────────────────────────────

@app.get("/api/companies", tags=["companies"])
async def list_companies(
    status: Optional[str] = Query(None, description="選考ステータスでフィルター"),
    sort_by: Optional[str] = Query("created_at", description="ソートカラム"),
    order: Optional[str] = Query("desc", description="asc / desc"),
):
    """
    企業一覧を取得する。

    - status: 「検討中」「書類応募」など選考ステータスでフィルタリング可能
    - sort_by / order: ソート順を指定
    """
    # SQLインジェクション対策: ソートカラムはホワイトリストで検証する
    allowed_columns = {
        "id", "name", "created_at", "status", "hiring_probability_score",
        "tech_growth_score", "career_growth_score", "expected_first_salary",
        "commute_time_car",
    }
    if sort_by not in allowed_columns:
        sort_by = "created_at"
    if order not in ("asc", "desc"):
        order = "desc"

    conn = get_connection()
    try:
        if status:
            rows = conn.execute(
                f"SELECT * FROM companies WHERE status = ? ORDER BY {sort_by} {order}",
                (status,),
            ).fetchall()
        else:
            rows = conn.execute(
                f"SELECT * FROM companies ORDER BY {sort_by} {order}"
            ).fetchall()
        return [row_to_dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/api/companies", tags=["companies"], status_code=201)
async def create_company(body: CompanyCreate):
    """
    企業を新規登録する。

    URLが重複している場合は 409 Conflict を返す。
    """
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM companies WHERE url = ?", (body.url,)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="この URL はすでに登録されています")

        cursor = conn.execute(
            "INSERT INTO companies (url, name, job_url, source, notes) VALUES (?, ?, ?, ?, ?)",
            (body.url, body.name, body.job_url, body.source, body.notes),
        )
        conn.commit()
        new_id = cursor.lastrowid
        row = conn.execute("SELECT * FROM companies WHERE id = ?", (new_id,)).fetchone()
        return row_to_dict(row)
    finally:
        conn.close()


@app.get("/api/companies/{company_id}", tags=["companies"])
async def get_company(company_id: int):
    """指定 ID の企業詳細を返す。存在しない場合は 404。"""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM companies WHERE id = ?", (company_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="企業が見つかりません")
        return row_to_dict(row)
    finally:
        conn.close()


@app.patch("/api/companies/{company_id}", tags=["companies"])
async def update_company(company_id: int, body: CompanyUpdate):
    """
    企業情報を部分更新する（PATCH）。

    None のフィールドはそのまま維持される（PUT と異なる点）。
    ステータス変更・メモ追記・AI分析結果の書き込みに使う。
    """
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM companies WHERE id = ?", (company_id,)
        ).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="企業が見つかりません")

        # None でないフィールドだけ UPDATE 対象にする
        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="更新するフィールドがありません")

        set_clause = ", ".join(f"{col} = ?" for col in updates)
        values = list(updates.values()) + [company_id]
        conn.execute(f"UPDATE companies SET {set_clause} WHERE id = ?", values)
        conn.commit()

        row = conn.execute("SELECT * FROM companies WHERE id = ?", (company_id,)).fetchone()
        return row_to_dict(row)
    finally:
        conn.close()


@app.delete("/api/companies/{company_id}", tags=["companies"], status_code=204)
async def delete_company(company_id: int):
    """
    企業を削除する。

    紐付いたスケジュールは ON DELETE CASCADE で自動削除される。
    """
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM companies WHERE id = ?", (company_id,)
        ).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="企業が見つかりません")

        conn.execute("DELETE FROM companies WHERE id = ?", (company_id,))
        conn.commit()
    finally:
        conn.close()


# ─────────────────────────────────────────────
# スケジュール管理 API
# ─────────────────────────────────────────────

@app.get("/api/schedules", tags=["schedules"])
async def list_schedules(
    company_id: Optional[int] = Query(None, description="企業IDで絞り込み"),
    upcoming: bool = Query(False, description="True にすると未来の予定のみ返す"),
):
    """
    面接スケジュール一覧を取得する。

    - company_id: 指定企業の面接だけに絞り込む
    - upcoming: True にすると現在日時以降の予定のみ返す
    """
    conn = get_connection()
    try:
        base = """
            SELECT s.*, c.name AS company_name
            FROM schedules s
            JOIN companies c ON s.company_id = c.id
        """
        conditions = []
        params = []

        if company_id:
            conditions.append("s.company_id = ?")
            params.append(company_id)
        if upcoming:
            conditions.append("s.start_time >= datetime('now', 'localtime')")

        if conditions:
            base += " WHERE " + " AND ".join(conditions)
        base += " ORDER BY s.start_time ASC"

        rows = conn.execute(base, params).fetchall()
        return [row_to_dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/api/schedules", tags=["schedules"], status_code=201)
async def create_schedule(body: ScheduleCreate):
    """面接スケジュールを登録する。"""
    conn = get_connection()
    try:
        company = conn.execute(
            "SELECT id FROM companies WHERE id = ?", (body.company_id,)
        ).fetchone()
        if company is None:
            raise HTTPException(status_code=404, detail="企業が見つかりません")

        cursor = conn.execute(
            """INSERT INTO schedules
               (company_id, event_title, start_time, interview_format, interviewer, interview_notes)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                body.company_id,
                body.event_title,
                body.start_time,
                body.interview_format,
                body.interviewer,
                body.interview_notes,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM schedules WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
        return row_to_dict(row)
    finally:
        conn.close()


@app.patch("/api/schedules/{schedule_id}", tags=["schedules"])
async def update_schedule(schedule_id: int, body: ScheduleUpdate):
    """面接結果の記録などスケジュール情報を部分更新する。"""
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM schedules WHERE id = ?", (schedule_id,)
        ).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="スケジュールが見つかりません")

        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="更新するフィールドがありません")

        set_clause = ", ".join(f"{col} = ?" for col in updates)
        values = list(updates.values()) + [schedule_id]
        conn.execute(f"UPDATE schedules SET {set_clause} WHERE id = ?", values)
        conn.commit()

        row = conn.execute("SELECT * FROM schedules WHERE id = ?", (schedule_id,)).fetchone()
        return row_to_dict(row)
    finally:
        conn.close()


@app.delete("/api/schedules/{schedule_id}", tags=["schedules"], status_code=204)
async def delete_schedule(schedule_id: int):
    """スケジュールを削除する。"""
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM schedules WHERE id = ?", (schedule_id,)
        ).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="スケジュールが見つかりません")

        conn.execute("DELETE FROM schedules WHERE id = ?", (schedule_id,))
        conn.commit()
    finally:
        conn.close()


# ─────────────────────────────────────────────
# ユーザープロフィール API
# ─────────────────────────────────────────────

@app.get("/api/profile", tags=["profile"])
async def get_profile():
    """ユーザープロフィール（1行固定）を取得する。"""
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="プロフィールが見つかりません")

        profile = row_to_dict(row)
        # JSON文字列フィールドをデコードして返す
        for field in ("current_skills", "ng_keywords"):
            if profile.get(field):
                try:
                    profile[field] = json.loads(profile[field])
                except json.JSONDecodeError:
                    pass
        return profile
    finally:
        conn.close()


@app.patch("/api/profile", tags=["profile"])
async def update_profile(body: UserProfileUpdate):
    """ユーザープロフィールを部分更新する。"""
    conn = get_connection()
    try:
        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="更新するフィールドがありません")

        set_clause = ", ".join(f"{col} = ?" for col in updates)
        values = list(updates.values())
        conn.execute(f"UPDATE user_profile SET {set_clause} WHERE id = 1", values)
        conn.commit()

        row = conn.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
        return row_to_dict(row)
    finally:
        conn.close()


# ─────────────────────────────────────────────
# AI 分析 API
# ─────────────────────────────────────────────

# AI が返すオブジェクト型フィールド。DB保存前にJSON文字列化する
_JSON_OBJECT_FIELDS = {"strengths_weaknesses", "interview_strategy", "scores", "skill_stack"}


@app.post("/api/companies/{company_id}/analyze", tags=["ai"])
async def analyze_company_endpoint(company_id: int):
    """
    企業URLをスクレイピングし、Gemini AIで分析してDBに保存する。

    処理の流れ:
    1. DBから企業URLとユーザープロフィールを取得
    2. 企業サイトをスクレイピング
    3. Gemini AI に分析を依頼
    4. 結果をDB（companiesテーブル）にPATCH
    5. 更新後の企業オブジェクトを返す
    """
    conn = get_connection()
    try:
        company = conn.execute(
            "SELECT * FROM companies WHERE id = ?", (company_id,)
        ).fetchone()
        if company is None:
            raise HTTPException(status_code=404, detail="企業が見つかりません")

        profile_row = conn.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
        user_profile = row_to_dict(profile_row) if profile_row else {}

        company_url = company["url"]
    finally:
        conn.close()

    # スクレイピング（失敗しても空文字を返すので処理は継続）
    scraped_text = scrape_company(company_url)

    # Gemini AI 分析（例外はそのまま上げてクライアントに 500 を返す）
    try:
        ai_result = analyze_company(company_url, scraped_text, user_profile)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI分析に失敗しました: {str(e)}")

    # オブジェクト型フィールドはJSON文字列に変換してから保存する
    for field in _JSON_OBJECT_FIELDS:
        if field in ai_result and isinstance(ai_result[field], (dict, list)):
            ai_result[field] = json.dumps(ai_result[field], ensure_ascii=False)

    # None 値は除外して UPDATE
    updates = {k: v for k, v in ai_result.items() if v is not None}
    if not updates:
        raise HTTPException(status_code=502, detail="AI分析結果が空でした")

    # companies テーブルの有効カラムのみ抽出（不正カラムによるSQLエラーを防ぐ）
    valid_columns = {
        "name", "industry", "employees", "founded_year", "listing_status",
        "development_type", "location", "commute_time_car", "commute_time_shinkansen",
        "work_style", "overtime_hours", "paid_leave_rate", "transfer",
        "salary", "bonus", "expected_first_salary", "salary_upper", "years_to_recover",
        "inexperienced_ok", "training_program", "hiring_probability_score",
        "job_description", "skill_stack", "tech_growth_score", "career_growth_score",
        "career_path", "benefits", "summary", "strengths_weaknesses",
        "interview_strategy", "scores",
    }
    updates = {k: v for k, v in updates.items() if k in valid_columns}

    conn = get_connection()
    try:
        set_clause = ", ".join(f"{col} = ?" for col in updates)
        values = list(updates.values()) + [company_id]
        conn.execute(f"UPDATE companies SET {set_clause} WHERE id = ?", values)
        conn.commit()

        row = conn.execute("SELECT * FROM companies WHERE id = ?", (company_id,)).fetchone()
        return row_to_dict(row)
    finally:
        conn.close()


# ─────────────────────────────────────────────
# スクショからスケジュール抽出 API
# ─────────────────────────────────────────────

@app.post("/api/schedules/from-image", tags=["schedules"])
async def schedule_from_image(body: ScheduleFromImage):
    """
    メールのスクリーンショット（base64）から面接スケジュールを抽出して返す。

    保存は行わない。フロントエンドで確認後に POST /api/schedules で保存する。
    抽出した company_name でDBを検索し、一致する企業があれば company_id も返す。
    """
    import base64 as b64

    try:
        image_bytes = b64.b64decode(body.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="画像データのデコードに失敗しました")

    try:
        extracted = extract_schedule_from_image(image_bytes, body.mime_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"画像解析に失敗しました: {str(e)}")

    # 企業名でDB照合（部分一致）
    extracted["company_id"] = None
    extracted["company_name_matched"] = None

    company_name = extracted.get("company_name")
    if company_name:
        conn = get_connection()
        try:
            row = conn.execute(
                "SELECT id, name FROM companies WHERE name LIKE ?",
                (f"%{company_name}%",),
            ).fetchone()
            if row:
                extracted["company_id"] = row["id"]
                extracted["company_name_matched"] = row["name"]
        finally:
            conn.close()

    return extracted


# ─────────────────────────────────────────────
# AIチャット補完 API
# ─────────────────────────────────────────────

@app.post("/api/companies/{company_id}/supplement", tags=["ai"])
async def supplement_company(
    company_id: int,
    text: str = Form(""),
    urls: str = Form("[]"),
    files: list[UploadFile] = File([]),
):
    """
    テキスト・URL・ファイル（画像/PDF/Word/Excel）を元に企業情報を補完する。

    - text: 面接メモ・コピペ情報など自由テキスト
    - urls: JSON配列文字列 ["https://...", ...]
    - files: multipart ファイル（複数可）
    """
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM companies WHERE id = ?", (company_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="企業が見つかりません")
        current_info = row_to_dict(row)
    finally:
        conn.close()

    # URLリストをパース
    try:
        url_list: list[str] = json.loads(urls)
    except Exception:
        url_list = []

    # ファイルをバイト列に変換
    uploaded: list[UploadedFile] = []
    for f in files:
        if not f.filename:
            continue
        ext = "." + f.filename.rsplit(".", 1)[-1].lower() if "." in f.filename else ""
        mime = f.content_type or _EXT_TO_MIME.get(ext, "application/octet-stream")
        content = await f.read()
        uploaded.append(UploadedFile(filename=f.filename, content=content, mime_type=mime))

    # AI補完呼び出し
    try:
        result = supplement(
            current_info=current_info,
            text=text,
            urls=url_list,
            files=uploaded,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI補完に失敗しました: {str(e)}")

    updates = result.get("updates", {})
    if not updates:
        return {"updated_fields": [], "company": current_info}

    # companies テーブルの有効カラムのみ抽出
    valid_columns = {
        "name", "industry", "employees", "founded_year", "listing_status",
        "development_type", "location", "work_style", "overtime_hours",
        "paid_leave_rate", "transfer", "salary", "expected_first_salary",
        "salary_upper", "inexperienced_ok", "training_program",
        "hiring_probability_score", "job_description", "skill_stack",
        "tech_growth_score", "career_growth_score", "career_path",
        "benefits", "summary", "strengths_weaknesses",
        "interview_strategy", "scores",
    }
    safe_updates = {k: v for k, v in updates.items() if k in valid_columns}

    conn = get_connection()
    try:
        if safe_updates:
            set_clause = ", ".join(f"{col} = ?" for col in safe_updates)
            values = list(safe_updates.values()) + [company_id]
            conn.execute(f"UPDATE companies SET {set_clause} WHERE id = ?", values)
            conn.commit()

        row = conn.execute("SELECT * FROM companies WHERE id = ?", (company_id,)).fetchone()
        return {
            "updated_fields": list(safe_updates.keys()),
            "company": row_to_dict(row),
        }
    finally:
        conn.close()
