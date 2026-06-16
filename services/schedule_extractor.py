"""
メールスクリーンショットからスケジュール情報を抽出するモジュール。

Gemini 2.5 Flash の Vision 機能を使い、貼り付けられた画像から
面接日時・企業名・形式などを自動読み取りする。
"""

import json
from datetime import date
import google.generativeai as genai
from config.settings import settings

genai.configure(api_key=settings.gemini_api_key)

_MODEL = genai.GenerativeModel(
    model_name="gemini-2.5-flash",
    generation_config=genai.types.GenerationConfig(
        response_mime_type="application/json",
        temperature=0.1,
    ),
)


def extract_schedule_from_image(image_bytes: bytes, mime_type: str = "image/png") -> dict:
    """
    メール画像から面接スケジュール情報を抽出して返す。

    返却辞書のキー:
        company_name  : 企業名（文字列 or null）
        event_title   : イベント名（例: カジュアル面談、1次面接）
        start_time    : 開始日時（ISO 8601: "2026-06-20T14:00:00"）
        interview_format : 対面 / オンライン / 不明
        interviewer   : 面接官名・部署（文字列 or null）
        interview_notes  : その他の補足情報（文字列 or null）
    """
    today = date.today().isoformat()
    prompt = f"""
あなたは転職活動のスケジュール管理AIです。
添付された画像はエージェント・企業からのメールのスクリーンショットです。

今日の日付: {today}

以下のJSON形式でスケジュール情報を抽出してください。
不明な項目は null にしてください。
日時は必ず ISO 8601 形式（例: "2026-06-20T14:00:00"）に変換してください。
年が省略されている場合は今年（{today[:4]}年）と解釈してください。

{{
  "company_name": "企業名（文字列 or null）",
  "event_title": "イベント種別（カジュアル面談 / 1次面接 / 2次面接 / 最終面接 / 書類選考通過 / 内定通知 / その他）",
  "start_time": "開始日時（ISO 8601形式 or null）",
  "interview_format": "対面 / オンライン / 不明",
  "interviewer": "面接官名・部署（文字列 or null）",
  "interview_notes": "URLや持ち物・その他の補足情報（文字列 or null）"
}}
""".strip()

    image_part = {"mime_type": mime_type, "data": image_bytes}
    response = _MODEL.generate_content([prompt, image_part])
    return json.loads(response.text.strip())
