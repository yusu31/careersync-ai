"""
Playwrightを使ってCareerSync AIのスクリーンショット・操作デモGIFを自動生成するスクリプト。

事前準備:
    1. uvicorn main:app --reload --port 8000 でサーバーを起動しておく
    2. python docs/scripts/seed_demo_data.py でデモデータを投入しておく
    3. pip install playwright Pillow imageio[ffmpeg]
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
    from PIL import Image
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


def _take(page) -> Image.Image:
    """現在の画面をキャプチャしてPIL Imageとして返す（ファイル保存なし）。"""
    tmp = OUTPUT_DIR / "_tmp_frame.png"
    page.screenshot(path=str(tmp), full_page=False)
    return Image.open(tmp).convert("RGB")


def add_frame(page, wait_ms: int = 0, duration_ms: int = 500):
    """GIFフレームを追加する。"""
    if wait_ms > 0:
        page.wait_for_timeout(wait_ms)
    gif_frames.append(_take(page))
    gif_durations_ms.append(duration_ms)


def save_screenshot(page, filename: str, wait_ms: int = 800):
    """個別スクリーンショットをファイルに保存する。"""
    page.wait_for_timeout(wait_ms)
    path = OUTPUT_DIR / filename
    page.screenshot(path=str(path), full_page=False)
    print(f"  [撮影] {filename}")
    return path


def main():
    print("=== CareerSync AI スクリーンショット自動生成 ===\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport=VIEWPORT)
        page = context.new_page()

        # ページ読み込み
        try:
            page.goto(BASE_URL, wait_until="networkidle", timeout=10_000)
        except PlaywrightTimeout:
            print(f"[エラー] {BASE_URL} に接続できません。")
            print("  uvicorn main:app --reload --port 8000 を先に起動してください。")
            browser.close()
            sys.exit(1)

        page.wait_for_selector(".company-card", timeout=8_000)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # Scene 1: ダッシュボード全体
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        print("\n[Scene 1] ダッシュボード全体")
        save_screenshot(page, "01_dashboard.png", wait_ms=1200)
        # GIF: ダッシュボードをじっくり見せる
        add_frame(page, duration_ms=3500)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # Scene 2: 1社目の企業カードにホバー → クリック
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        print("\n[Scene 2] 1社目カードにホバー → 詳細表示")
        cards = page.locator(".company-card")
        first_card = cards.first
        first_card.hover()
        add_frame(page, wait_ms=700, duration_ms=1500)  # ホバー状態を見せる

        first_card.click()
        page.wait_for_selector("canvas", timeout=6_000)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # Scene 3: 企業詳細（レーダーチャート）
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        print("\n[Scene 3] 企業詳細・レーダーチャート")
        save_screenshot(page, "02_detail_radar.png", wait_ms=1500)
        add_frame(page, duration_ms=3500)  # スコア+チャートをじっくり

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # Scene 4: 詳細ページをゆっくりスクロール（面接対策セクションへ）
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        print("\n[Scene 4] 詳細ページをスクロール（面接対策へ）")
        for _ in range(3):
            page.mouse.wheel(0, 300)
            add_frame(page, wait_ms=400, duration_ms=600)  # スクロール中

        add_frame(page, wait_ms=500, duration_ms=3000)  # 面接対策セクション表示

        save_screenshot(page, "03_detail_another.png", wait_ms=300)

        # ページトップに戻す
        page.keyboard.press("Home")
        page.wait_for_timeout(400)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # Scene 5: 2社目の企業カードにホバー → クリック
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        print("\n[Scene 5] 2社目カードにホバー → 詳細表示")
        if cards.count() >= 2:
            second_card = cards.nth(1)
            second_card.hover()
            add_frame(page, wait_ms=700, duration_ms=1200)
            second_card.click()
            page.wait_for_timeout(1000)
            add_frame(page, wait_ms=500, duration_ms=2500)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # Scene 6: 企業追加ボタンにホバー → モーダルを開く
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        print("\n[Scene 6] 企業追加モーダル")
        btn_add = page.locator("#btn-add-company")
        btn_add.hover()
        add_frame(page, wait_ms=600, duration_ms=1200)
        btn_add.click()
        page.wait_for_selector("#modal-add", state="visible", timeout=4_000)
        page.wait_for_timeout(500)

        save_screenshot(page, "04_modal_add_company.png", wait_ms=300)
        add_frame(page, duration_ms=2500)  # モーダル全体を見せる

        # URL入力フィールドにゆっくりタイピング
        url_input = page.locator("#input-url")
        if url_input.count() > 0:
            url_input.click()
            sample_url = "https://careers.example.co.jp/"
            for i, char in enumerate(sample_url):
                url_input.type(char, delay=80)
                # 数文字ごとにフレームを追加（タイピング感）
                if (i + 1) % 8 == 0:
                    add_frame(page, wait_ms=0, duration_ms=400)
            add_frame(page, wait_ms=300, duration_ms=2000)  # 入力完了

        # モーダルを閉じる
        page.locator("#btn-close-modal").click()
        page.wait_for_selector("#modal-add", state="hidden", timeout=4_000)
        page.wait_for_timeout(400)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # Scene 7: スクショからスケジュール登録モーダル
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        print("\n[Scene 7] スクショからスケジュール登録モーダル")
        btn_schedule = page.locator("#btn-add-schedule-image")
        btn_schedule.hover()
        add_frame(page, wait_ms=600, duration_ms=1200)
        btn_schedule.click()
        page.wait_for_selector("#modal-schedule-image", state="visible", timeout=4_000)
        page.wait_for_timeout(500)

        save_screenshot(page, "05_modal_schedule_image.png", wait_ms=300)
        add_frame(page, duration_ms=3000)

        page.locator("#btn-close-schedule-modal").click()
        page.wait_for_timeout(500)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # Scene 8: ダッシュボードに戻る（ループの起点に戻す）
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        print("\n[Scene 8] ダッシュボードに戻る")
        add_frame(page, wait_ms=600, duration_ms=2500)

        browser.close()

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # GIF生成（PILでフレームごとに個別の表示時間を設定）
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    print(f"\n[GIF] 操作デモGIFを生成中... ({len(gif_frames)}フレーム)")

    if len(gif_frames) >= 2:
        gif_path = OUTPUT_DIR / "demo.gif"

        first = gif_frames[0]
        rest = gif_frames[1:]

        first.save(
            str(gif_path),
            format="GIF",
            append_images=rest,
            save_all=True,
            duration=gif_durations_ms,  # フレームごとに個別の表示時間
            loop=0,
            optimize=False,
        )

        total_sec = sum(gif_durations_ms) / 1000
        size_kb = gif_path.stat().st_size // 1024
        print(f"  [完了] demo.gif ({len(gif_frames)}フレーム / 合計約{total_sec:.0f}秒 / {size_kb} KB)")
    else:
        print("  [スキップ] フレームが不足しています")

    # 一時ファイルを削除
    tmp = OUTPUT_DIR / "_tmp_frame.png"
    if tmp.exists():
        tmp.unlink()

    print(f"\n=== 完了 ===")
    print(f"生成先: {OUTPUT_DIR}")
    for f in sorted(OUTPUT_DIR.glob("*.png")):
        size_kb = f.stat().st_size // 1024
        print(f"  {f.name} ({size_kb} KB)")
    gif = OUTPUT_DIR / "demo.gif"
    if gif.exists():
        size_kb = gif.stat().st_size // 1024
        print(f"  demo.gif ({size_kb} KB)")


if __name__ == "__main__":
    main()
