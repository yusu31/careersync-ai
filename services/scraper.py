"""
企業サイトのWebスクレイピングモジュール。

企業URLからテキストを取得し、AIに渡せる形に整形する。
スクレイピングが失敗した場合は空文字を返し、AIがURL情報のみで分析する。
"""

import re
import requests
from bs4 import BeautifulSoup

# 取得テキストの最大文字数。Geminiのトークン上限に引っかからないよう制限する
_MAX_TEXT_LENGTH = 6000

# ブラウザを偽装してアクセス拒否を回避する
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
}

# 本文に不要なタグ（ナビ・フッター・スクリプトなど）
_NOISE_TAGS = ["script", "style", "nav", "header", "footer", "aside", "noscript"]


def scrape_company(url: str) -> str:
    """
    企業URLのHTMLを取得し、本文テキストを返す。

    失敗した場合は空文字を返す（呼び出し元でエラー処理不要）。
    """
    try:
        response = requests.get(url, headers=_HEADERS, timeout=15)
        response.raise_for_status()
        # 文字化け対策: レスポンスのエンコーディングを自動検出
        response.encoding = response.apparent_encoding
        return _extract_text(response.text)
    except Exception:
        # タイムアウト・接続拒否・404などすべてを空文字で吸収する
        return ""


def _extract_text(html: str) -> str:
    """HTMLから本文テキストを抽出し、最大文字数に切り詰めて返す。"""
    soup = BeautifulSoup(html, "html.parser")

    # ノイズタグを除去
    for tag in soup(_NOISE_TAGS):
        tag.decompose()

    # テキストを取得し、連続する空白・改行を整理する
    raw = soup.get_text(separator="\n")
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    text = "\n".join(lines)

    # 長すぎる場合は先頭から切り詰める（トップページの情報が重要）
    return text[:_MAX_TEXT_LENGTH]
