"""
テーブル定義と初期化モジュール

init_db() を呼ぶと、なければテーブルを作成する。
FastAPI起動時（main.py の startup イベント）から呼ぶことで自動初期化される。
"""

from database.connection import get_connection


def init_db() -> None:
    """companiesテーブルとschedulesテーブルを作成する（既存なら何もしない）。"""
    conn = get_connection()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS companies (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                name                 TEXT,
                url                  TEXT NOT NULL UNIQUE,
                summary              TEXT,
                -- AI分析結果はJSONテキストで保存する
                strengths_weaknesses TEXT,
                interview_strategy   TEXT,
                scores               TEXT,
                status               TEXT NOT NULL DEFAULT '検討中',
                created_at           TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );

            CREATE TABLE IF NOT EXISTS schedules (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id       INTEGER NOT NULL,
                event_title      TEXT NOT NULL,
                start_time       TEXT NOT NULL,
                -- Googleカレンダーと連携するときの重複管理キー
                google_event_id  TEXT UNIQUE,
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            );
        """)
        conn.commit()
        print("[OK] データベースの初期化が完了しました")
    finally:
        conn.close()


if __name__ == "__main__":
    init_db()
