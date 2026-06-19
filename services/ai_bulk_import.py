"""
複数ファイルから企業情報を一括抽出するモジュール。

対応形式:
  - 画像 (PNG/JPG/WebP/GIF): Gemini Vision で直接解析
  - PDF: pdfplumber でテキスト抽出 → 画像PDFは Gemini Vision に直接送信
  - Excel / CSV: pandas で読み込みテキスト化 → Gemini へ送信
  - Word (.docx): python-docx でテキスト抽出 → Gemini へ送信
"""

import io
import json
from dataclasses import dataclass

import google.generativeai as genai
from config.settings import settings

genai.configure(api_key=settings.gemini_api_key)

_MODEL = genai.GenerativeModel(
    model_name="gemini-2.5-flash",
    generation_config=genai.types.GenerationConfig(
        response_mime_type="application/json",
        temperature=0.2,
    ),
)

_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
_MAX_IMAGE_BYTES = 4 * 1024 * 1024  # 4 MB — Gemini の推奨上限

_EXTRACT_PROMPT = """あなたは転職活動支援AIです。
添付ファイル（画像・PDF・スプレッドシート等）から企業情報をすべて抽出してください。

【出力形式】JSON配列のみ返すこと（コードブロック不要）:
[
  {
    "name": "企業名（必須、不明なら null）",
    "url": "コーポレートURL（文書に記載がない場合は企業名・業種・所在地から公式サイトURLを推定すること。推定できない場合のみ null）",
    "job_url": "求人ページURL（文書中にURLがあれば必ず入れる。不明なら null）",
    "industry": "業種（不明なら null）",
    "location": "勤務地（不明なら null）",
    "salary": "年収レンジ（例: 400〜600万円、不明なら null）",
    "work_style": "フルリモート/ハイブリッド/出社（不明なら null）",
    "employees": "従業員数（不明なら null）",
    "development_type": "SES/受託/自社開発等（不明なら null）",
    "inexperienced_ok": 未経験歓迎=1 否=0 不明=null,
    "notes": "その他メモすべき情報（不明なら null）"
  }
]

【注意】
- 企業が複数あればすべて配列要素として返す
- url は必ず埋めること。文書になければ企業名から推定する（例: 株式会社○○ → https://www.○○.co.jp）
- URLらしき文字列は必ず url か job_url に入れる
- 存在しない・確信が持てないURLは null にする（ハルシネーション禁止）"""


@dataclass
class BulkFile:
    filename: str
    content: bytes
    mime_type: str


def _resize_image_if_needed(content: bytes, mime_type: str) -> bytes:
    """大きい画像を Gemini 推奨サイズ（4MB・長辺2048px）以内にリサイズする。"""
    if len(content) <= _MAX_IMAGE_BYTES:
        return content
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(content))
        w, h = img.size
        if max(w, h) > 2048:
            scale = 2048 / max(w, h)
            img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG" if "jpeg" in mime_type else "PNG", optimize=True)
        return buf.getvalue()
    except Exception:
        return content


def _extract_pdf_text(content: bytes) -> str:
    """pdfplumber でテキストを抽出する。画像PDFは空文字を返す。"""
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            pages = []
            for i, page in enumerate(pdf.pages[:10]):
                text = page.extract_text()
                if text:
                    pages.append(f"[ページ {i + 1}]\n{text}")
            return "\n\n".join(pages)
    except Exception:
        return ""


def _extract_tabular_text(content: bytes, filename: str) -> str:
    """pandas で Excel / CSV を読み込みテキスト化する。日本語Shift-JISも対応。"""
    try:
        import pandas as pd
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext == "csv":
            for enc in ("utf-8-sig", "utf-8", "shift-jis", "cp932"):
                try:
                    df = pd.read_csv(io.BytesIO(content), encoding=enc)
                    break
                except Exception:
                    continue
            else:
                return ""
        else:
            df = pd.read_excel(io.BytesIO(content))
        return df.head(200).to_string(index=False)
    except Exception:
        return ""


def _extract_docx_text(content: bytes) -> str:
    """python-docx で Word ドキュメントのテキストを抽出する。"""
    try:
        from docx import Document
        doc = Document(io.BytesIO(content))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n".join(paragraphs)
    except Exception:
        return ""


def _build_parts(files: list[BulkFile], text: str = "") -> list:
    """Gemini に送信するコンテンツパーツのリストを構築する。"""
    parts: list = [_EXTRACT_PROMPT]

    if text.strip():
        parts.append(f"\n[テキスト情報]\n{text.strip()}")

    for f in files:
        if f.mime_type in _IMAGE_MIME_TYPES:
            resized = _resize_image_if_needed(f.content, f.mime_type)
            parts.append({"mime_type": f.mime_type, "data": resized})

        elif f.mime_type == "application/pdf":
            extracted = _extract_pdf_text(f.content)
            if len(extracted.strip()) >= 100:
                parts.append(f"\n[PDF: {f.filename}]\n{extracted}")
            else:
                # テキスト抽出不可 → 画像PDFとしてGemini Visionに直送
                parts.append({"mime_type": "application/pdf", "data": f.content})

        elif (any(k in f.mime_type for k in ("spreadsheet", "ms-excel", "csv"))
              or f.filename.lower().endswith((".csv", ".xlsx", ".xls"))):
            extracted = _extract_tabular_text(f.content, f.filename)
            if extracted:
                parts.append(f"\n[スプレッドシート: {f.filename}]\n{extracted}")

        elif "wordprocessingml" in f.mime_type:
            extracted = _extract_docx_text(f.content)
            if extracted:
                parts.append(f"\n[Word: {f.filename}]\n{extracted}")

    return parts


def extract_companies(files: list[BulkFile], text: str = "") -> list[dict]:
    """
    ファイル群・テキストから企業情報リストを Gemini で抽出する。

    Returns:
        企業情報 dict のリスト。各 dict は name/url/industry 等を持つ。
        入力が空または解析不能な場合は空リストを返す。
    """
    parts = _build_parts(files, text)
    if len(parts) <= 1:
        return []

    response = _MODEL.generate_content(parts)
    raw = response.text.strip()

    # ```json ... ``` で返ってきた場合に備えて除去
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1])
        if raw.startswith("json"):
            raw = raw[4:].strip()

    result = json.loads(raw.strip())
    return result if isinstance(result, list) else [result]
