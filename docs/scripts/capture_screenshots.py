"""
Playwrightを使ってCareerSync AIのスクリーンショット・操作デモGIFを自動生成するスクリプト。

事前準備:
    1. uvicorn main:app --reload --port 8000 でサーバーを起動しておく
    2. python docs/scripts/seed_demo_data.py でデモデータを投入しておく
    3. pip install playwright Pillow
    4. playwright install chromium

実行方法（プロジェクトルートから）:
    python docs/scripts/capture_screenshots.py

生成先: docs/images/
"""

import sys
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
except ImportError:
    print("[エラー] Playwright がインストールされていません。")
    print("  pip install playwright && playwright install chromium")
    sys.exit(1)

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("[エラー] Pillow がインストールされていません。")
    print("  pip install Pillow")
    sys.exit(1)

BASE_URL = "http://localhost:8000"
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "docs" / "images"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

VIEWPORT = {"width": 1280, "height": 720}

# GIF用フレームと各表示時間（ミリ秒）
gif_frames: list[Image.Image] = []
gif_durations_ms: list[int] = []

# 字幕バーの設定
CAPTION_HEIGHT = 72
CAPTION_BG = (15, 23, 42)       # ネイビー
CAPTION_TEXT_COLOR = (255, 255, 255)
CAPTION_ACCENT_COLOR = (99, 102, 241)  # インジゴ（アプリのアクセントカラーに合わせる）

# Windowsの日本語フォント（複数候補を試す）
FONT_CANDIDATES = [
    "C:/Windows/Fonts/meiryo.ttc",
    "C:/Windows/Fonts/YuGothR.ttc",
    "C:/Windows/Fonts/msgothic.ttc",
]


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def add_caption(img: Image.Image, step: str, text: str) -> Image.Image:
    """画像の下部に字幕バーを合成して返す。"""
    result = img.copy()
    w, h = result.size

    draw = ImageDraw.Draw(result)

    # 字幕バー背景
    y0 = h - CAPTION_HEIGHT
    draw.rectangle([(0, y0), (w, h)], fill=CAPTION_BG)

    # ステップ番号（アクセントカラー）
    font_step = _load_font(22)
    font_text = _load_font(26)

    step_bbox = font_step.getbbox(step)
    step_w = step_bbox[2] - step_bbox[0]

    center_y = y0 + CAPTION_HEIGHT // 2

    # ステップを左寄りに、本文をその右に配置
    margin = 40
    draw.text((margin, center_y), step, fill=CAPTION_ACCENT_COLOR, font=font_step, anchor="lm")
    draw.text((margin + step_w + 16, center_y), text, fill=CAPTION_TEXT_COLOR, font=font_text, anchor="lm")

    return result


def screenshot_to_image(page, wait_ms: int = 800) -> Image.Image:
    """現在の画面をキャプチャして PIL Image として返す。"""
    tmp = OUTPUT_DIR / "_tmp.png"
    page.wait_for_timeout(wait_ms)
    page.screenshot(path=str(tmp), full_page=False)
    return Image.open(tmp).convert("RGB")


def add_scene(img: Image.Image, step: str, caption: str, duration_ms: int):
    """字幕を合成してGIFフレームとして追加する。"""
    frame = add_caption(img, step, caption)
    gif_frames.append(frame)
    gif_durations_ms.append(duration_ms)


def main():
    print("=== CareerSync AI スクリーンショット自動生成 ===\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport=VIEWPORT)
        page = context.new_page()

        try:
            page.goto(BASE_URL, wait_until="networkidle", timeout=10_000)
        except PlaywrightTimeout:
            print(f"[エラー] {BASE_URL} に接続できません。")
            print("  uvicorn main:app --reload --port 8000 を先に起動してください。")
            browser.close()
            sys.exit(1)

        page.wait_for_selector(".company-card", timeout=8_000)

        # ── Scene 1: ダッシュボード全体 ────────────────────────────────
        print("\n[Scene 1] ダッシュボード全体")
        img = screenshot_to_image(page, wait_ms=1200)
        img.save(str(OUTPUT_DIR / "01_dashboard.png"))
        print("  [撮影] 01_dashboard.png")
        add_scene(img,
                  step="OVERVIEW",
                  caption="選考中の全企業をステータスごとに一覧管理",
                  duration_ms=4500)

        # ── Scene 2: 企業詳細（上部：事業概要・スコア） ────────────────
        print("\n[Scene 2] 企業詳細・上部")
        cards = page.locator(".company-card")
        cards.first.click()
        page.wait_for_selector("canvas", timeout=6_000)
        img = screenshot_to_image(page, wait_ms=1500)
        img.save(str(OUTPUT_DIR / "02_detail_radar.png"))
        print("  [撮影] 02_detail_radar.png")
        add_scene(img,
                  step="STEP 1",
                  caption="URLを1つ入力するだけで AI が企業情報・スコアを自動分析",
                  duration_ms=4500)

        # ── Scene 3: 詳細ページ下部（面接対策） ────────────────────────
        print("\n[Scene 3] 企業詳細・下部（面接対策）")
        # 右ペイン（section.overflow-y-auto）を直接スクロール
        page.evaluate(
            "document.querySelector('section.overflow-y-auto').scrollTo({ top: 1100, behavior: 'instant' })"
        )
        img = screenshot_to_image(page, wait_ms=800)
        img.save(str(OUTPUT_DIR / "03_detail_another.png"))
        print("  [撮影] 03_detail_another.png")
        add_scene(img,
                  step="STEP 2",
                  caption="志望動機・強み弱み・面接想定問答まで自動生成",
                  duration_ms=4500)

        # 右ペインをトップに戻す
        page.evaluate(
            "document.querySelector('section.overflow-y-auto').scrollTo({ top: 0, behavior: 'instant' })"
        )
        page.wait_for_timeout(400)

        # ── Scene 4: 別の企業詳細 ──────────────────────────────────────
        print("\n[Scene 4] 別の企業詳細")
        if cards.count() >= 2:
            cards.nth(1).click()
            page.wait_for_timeout(800)
            img = screenshot_to_image(page, wait_ms=500)
        else:
            img = screenshot_to_image(page, wait_ms=500)

        # Scene 4 はスクリーンショット保存なし（GIFのみ）
        add_scene(img,
                  step="STEP 3",
                  caption="複数企業をワンクリックで切り替え・比較できる",
                  duration_ms=3500)

        # ── Scene 5: 企業追加モーダル ──────────────────────────────────
        print("\n[Scene 5] 企業追加モーダル")
        page.locator("#btn-add-company").click()
        page.wait_for_selector("#modal-add", state="visible", timeout=4_000)
        img = screenshot_to_image(page, wait_ms=600)
        img.save(str(OUTPUT_DIR / "04_modal_add_company.png"))
        print("  [撮影] 04_modal_add_company.png")
        add_scene(img,
                  step="STEP 4",
                  caption="＋ボタン → URL を貼り付けるだけで AI 分析が自動開始",
                  duration_ms=4500)
        page.locator("#btn-close-modal").click()
        page.wait_for_selector("#modal-add", state="hidden", timeout=4_000)
        page.wait_for_timeout(400)

        # ── Scene 6: スケジュール登録モーダル ─────────────────────────
        print("\n[Scene 6] スケジュール登録モーダル")
        page.locator("#btn-add-schedule-image").click()
        page.wait_for_selector("#modal-schedule-image", state="visible", timeout=4_000)
        img = screenshot_to_image(page, wait_ms=600)
        img.save(str(OUTPUT_DIR / "05_modal_schedule_image.png"))
        print("  [撮影] 05_modal_schedule_image.png")
        add_scene(img,
                  step="STEP 5",
                  caption="面接通知メールのスクショを貼るだけで日程を自動登録",
                  duration_ms=4500)
        page.locator("#btn-close-schedule-modal").click()
        page.wait_for_timeout(400)

        browser.close()

    # ── GIF生成 ──────────────────────────────────────────────────────
    print(f"\n[GIF] 操作デモGIFを生成中... ({len(gif_frames)}フレーム)")

    if len(gif_frames) >= 2:
        gif_path = OUTPUT_DIR / "demo.gif"

        gif_frames[0].save(
            str(gif_path),
            format="GIF",
            append_images=gif_frames[1:],
            save_all=True,
            duration=gif_durations_ms,
            loop=0,
            optimize=False,
        )

        total_sec = sum(gif_durations_ms) / 1000
        size_kb = gif_path.stat().st_size // 1024
        print(f"  [完了] demo.gif ({len(gif_frames)}フレーム / 合計{total_sec:.0f}秒 / {size_kb} KB)")
    else:
        print("  [スキップ] フレームが不足しています")

    # 一時ファイルを削除
    tmp = OUTPUT_DIR / "_tmp.png"
    if tmp.exists():
        tmp.unlink()

    print(f"\n=== 完了 ===")
    for f in sorted(OUTPUT_DIR.glob("*.png")):
        size_kb = f.stat().st_size // 1024
        print(f"  {f.name} ({size_kb} KB)")
    gif = OUTPUT_DIR / "demo.gif"
    if gif.exists():
        size_kb = gif.stat().st_size // 1024
        print(f"  demo.gif ({size_kb} KB)")


if __name__ == "__main__":
    main()
