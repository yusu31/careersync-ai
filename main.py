"""
CareerSync AI — FastAPI エントリーポイント

このファイルがアプリ全体の「玄関口」です。
`uvicorn main:app --reload` で起動します。
"""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request

# FastAPIアプリのインスタンスを作成
app = FastAPI(
    title="CareerSync AI",
    description="転職活動用 パーソナル企業分析＆選考管理ハブ",
    version="0.1.0",
)

# 静的ファイル（CSS/JS）をブラウザから取得できるように公開
app.mount("/static", StaticFiles(directory="static"), name="static")

# HTMLテンプレートの置き場所を指定
templates = Jinja2Templates(directory="templates")


@app.get("/")
async def root(request: Request):
    """
    ルートURL（http://localhost:8000）にアクセスしたときの処理。
    後でダッシュボードHTMLを返すようにする。今はシンプルなJSONを返す。
    """
    return {
        "message": "CareerSync AI 起動中",
        "status": "ok",
        "version": "0.1.0",
        "docs": "http://localhost:8000/docs",
    }
