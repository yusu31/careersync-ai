"""
Gemini AIによる企業分析モジュール。

企業サイトのテキストとユーザープロフィールを組み合わせて、
転職判断に必要な全フィールドをJSON形式で返す。
"""

import json
import google.generativeai as genai
from config.settings import settings

# モデル初期化はモジュールロード時に1回だけ行う
genai.configure(api_key=settings.gemini_api_key)

_MODEL = genai.GenerativeModel(
    model_name="gemini-2.5-flash",
    generation_config=genai.types.GenerationConfig(
        response_mime_type="application/json",
        temperature=0.3,
    ),
)


def analyze_company(url: str, scraped_text: str, user_profile: dict) -> dict:
    """
    企業URLとスクレイピングテキスト、ユーザープロフィールを元にAI分析を行う。

    戻り値は companies テーブルに直接 PATCH できる dict 形式。
    APIエラー時は例外をそのまま上げる（エンドポイント側でハンドリング）。
    """
    prompt = _build_prompt(url, scraped_text, user_profile)
    response = _MODEL.generate_content(prompt)
    raw = response.text.strip()

    # JSON として解析できない場合はエラーにする
    result = json.loads(raw)
    return result


def _build_prompt(url: str, scraped_text: str, user_profile: dict) -> str:
    """分析プロンプトを組み立てる。"""

    # ng_keywords を文字列化
    ng_raw = user_profile.get("ng_keywords", "[]")
    if isinstance(ng_raw, str):
        try:
            ng_list = json.loads(ng_raw)
        except json.JSONDecodeError:
            ng_list = []
    else:
        ng_list = ng_raw if isinstance(ng_raw, list) else []
    ng_keywords_str = "、".join(ng_list) if ng_list else "なし"

    site_section = (
        f"【企業サイト抜粋】\n{scraped_text}"
        if scraped_text
        else "（スクレイピング不可。URLと一般知識から推定してください）"
    )

    return f"""
あなたは転職エージェントのAIです。
以下の企業情報とユーザープロフィールをもとに、転職判断に必要な分析をJSON形式で返してください。

---
【分析対象企業URL】
{url}

{site_section}

---
【ユーザープロフィール】
- 自宅住所: {user_profile.get("home_address", "福島県郡山市字原中")}
- 現在の年収: {user_profile.get("current_salary", 600)}万円
- IT経験年数: {user_profile.get("experience_years", 0)}年（0は完全未経験）
- 希望職種: {user_profile.get("desired_role", "バックエンドエンジニア（自社開発・受託）")}
- 除外キーワード: {ng_keywords_str}

---
【出力形式】
以下のJSONキーをすべて含めて返してください。
不明・推定不可の項目は null にしてください。
文字列はすべて日本語で書いてください。

{{
  "name": "企業名（文字列）",
  "url": "コーポレートサイトのURL（企業名・業種等から調べて入れること。不明なら null）",
  "industry": "業種（例: SaaS / 製造業 / コンサル / Webサービス）",
  "employees": "従業員数（例: 100〜300人）",
  "founded_year": 設立年（整数 or null）,
  "listing_status": "上場区分（東証プライム / 東証グロース / 未上場 / 非公開）",
  "development_type": "開発形態（SES / 受託 / SIer / 自社開発 / ハイブリッド）",
  "location": "勤務地（都道府県市区町村レベル）",
  "commute_time_car": 郡山市字原中からの車での通勤時間（分、整数 or null）,
  "work_style": "勤務形態（フルリモート / ハイブリッド / 出社）",
  "overtime_hours": 月平均残業時間（整数 or null）,
  "paid_leave_rate": 有給消化率（整数0〜100 or null）,
  "transfer": "転勤（あり / なし / 相談可 / 非公開）",
  "salary": "年収レンジ（例: 350〜500万円）",
  "bonus": "賞与（例: 年2回・計4ヶ月分）",
  "expected_first_salary": ユーザーの転職直後の予想年収（万円、整数 or null）,
  "salary_upper": 年収アッパー目安（万円、整数 or null）,
  "years_to_recover": 現年収600万円に近づく目安年数（小数 or null、例: 3.5）,
  "inexperienced_ok": 未経験枠あり（1=あり / 0=なし）,
  "training_program": "研修内容・期間（文字列 or null）",
  "hiring_probability_score": ユーザーの採用可能性スコア（1〜10の整数）,
  "job_description": "具体的な業務内容（3〜5行）",
  "skill_stack": "[\"Python\", \"AWS\"]のようなJSON配列文字列",
  "tech_growth_score": 技術を身につけやすい度（1〜10の整数）,
  "career_growth_score": キャリアアップしやすい度（1〜10の整数）,
  "career_path": "想定キャリアの道筋（2〜3行）",
  "benefits": "福利厚生まとめ（文字列）",
  "qualification_support": "資格補助・支援制度（例: 応用情報・AWS・G検定 費用全額支給、など。不明ならnull）",
  "beginner_description": "IT未経験者向けに『この会社では毎日具体的に何をするのか』を小学生でもわかる平易な言葉で3〜5行で説明。専門用語は使わず、使う場合はカッコ内で簡単に補足すること。例: 『チームで話し合いながら、会社の業務をラクにするソフトウェアを作ります。毎朝10分の朝会で今日やることを共有し、午前中はコード（コンピューターへの命令文）を書き、午後はテスト（動作確認）をする、という流れが多いです』",
  "summary": "事業概要（3〜5行）",
  "strengths_weaknesses": {{
    "strengths": ["強み1", "強み2", "強み3"],
    "weaknesses": ["弱み1", "弱み2"]
  }},
  "interview_strategy": {{
    "likely_questions": ["想定質問1", "想定質問2", "想定質問3"],
    "advice": "面接対策アドバイス（2〜3行）"
  }},
  "scores": {{
    "growth": 成長性スコア（1〜10）,
    "stability": 安定性スコア（1〜10）,
    "culture_fit": カルチャーフィットスコア（1〜10）,
    "work_life_balance": WLBスコア（1〜10）,
    "compensation": 待遇スコア（1〜10）
  }}
}}

---
【スコア算出の指針】
- hiring_probability_score: 未経験（experience_years=0）でも採用可能なら高め。除外キーワード（{ng_keywords_str}）に該当する開発形態なら1〜3に下げる。
- years_to_recover: expected_first_salary から年収600万円に戻るまでの昇給ペースを推定。未経験採用の場合は長め（3〜7年）を見積もる。
- strengths_weaknesses / interview_strategy は必ずオブジェクト形式で返す（文字列にしない）。
""".strip()
