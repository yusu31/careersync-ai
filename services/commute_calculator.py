"""
Gemini を使って通勤時間・距離・費用・経路を推定するモジュール。

郡山市字原中を起点として、会社の所在地までの交通手段別の
通勤情報（所要時間・距離・片道費用・おすすめ経路）を返す。
"""

import json
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

USER_ORIGIN = "福島県郡山市字原中"

TRANSPORT_LABELS = {
    "car":        "車",
    "shinkansen": "新幹線+電車",
    "train":      "在来線のみ",
}


def estimate_commute(company_location: str) -> dict:
    """
    会社の所在地（例: "東京都渋谷区"）を受け取り、
    各交通手段の通勤情報を推定して返す。

    返却形式:
    {
        "car": {
            "minutes": 170,
            "distance_km": 255,
            "route": "東北自動車道 郡山IC → 浦和IC",
            "cost_yen": 3900,
            "feasibility": "daily" | "occasional" | "impractical"
        },
        "shinkansen": { ... },
        "train": { ... }
    }
    """
    prompt = f"""あなたは日本の交通事情に精通した専門家です。

出発地: {USER_ORIGIN}（福島県）
目的地: {company_location}

以下の5つの交通手段それぞれについて、実際のルートに基づいて通勤情報を推定してください。
数値は現実的な概算で構いません。

返却形式（JSON のみ、コードブロック不要）:
{{
  "car": {{
    "minutes": <片道所要時間（分）>,
    "distance_km": <片道距離（km）>,
    "route": "<主な経路（例: 東北自動車道 郡山IC→浦和IC）>",
    "cost_yen": <片道高速代の概算（円）>,
    "feasibility": "<daily | occasional | impractical>"
  }},
  "shinkansen": {{
    "minutes": <片道所要時間（分）>,
    "distance_km": <片道距離（km）>,
    "route": "<例: 郡山→東京(新幹線75分)+山手線(20分)>",
    "cost_yen": <片道運賃概算（円）>,
    "feasibility": "<daily | occasional | impractical>"
  }},
  "train": {{
    "minutes": <在来線のみ。非現実的なら null>,
    "distance_km": <距離。不明なら null>,
    "route": "<経路の説明>",
    "cost_yen": <片道運賃概算（円）。不明なら null>,
    "feasibility": "<daily | occasional | impractical>"
  }},
  "bus": {{
    "minutes": <高速バスなど。なければ null>,
    "distance_km": <距離。不明なら null>,
    "route": "<例: 郡山→新宿(高速バス4時間) など。なければ「高速バス便なし」>",
    "cost_yen": <片道運賃概算（円）。不明なら null>,
    "feasibility": "<daily | occasional | impractical>"
  }},
  "walk": {{
    "minutes": <徒歩のみ。非現実的なら null>,
    "distance_km": <距離。不明なら null>,
    "route": "<徒歩ルートの説明。現実的でない場合は「徒歩圏外」>",
    "cost_yen": 0,
    "feasibility": "<daily | occasional | impractical>"
  }}
}}

feasibility の基準:
- daily: 毎日通勤が現実的（片道90分以内）
- occasional: 週1〜2回程度なら現実的（片道180分以内）
- impractical: 通勤は非現実的"""

    response = _MODEL.generate_content(prompt)
    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    return json.loads(raw.strip())
