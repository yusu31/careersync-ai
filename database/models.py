"""
テーブル定義と初期化モジュール

init_db() を呼ぶと、なければテーブルを作成する。
FastAPI起動時（main.py の startup イベント）から呼ぶことで自動初期化される。
"""

from database.connection import get_connection


def init_db() -> None:
    """全テーブルを作成する（既存なら何もしない）。"""
    conn = get_connection()
    try:
        conn.executescript("""
            -- =========================================================
            -- companies: 企業情報 + AI分析結果 + 個人最適化スコア
            -- =========================================================
            CREATE TABLE IF NOT EXISTS companies (

                -- 基本情報
                id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                name                    TEXT,
                url                     TEXT NOT NULL UNIQUE,
                job_url                 TEXT,
                industry                TEXT,
                employees               TEXT,
                founded_year            INTEGER,
                listing_status          TEXT,
                development_type        TEXT,

                -- 勤務条件
                location                TEXT,
                commute_time_car        INTEGER,
                commute_time_shinkansen INTEGER,
                commute_allowance       TEXT,
                work_style              TEXT,
                overtime_hours          INTEGER,
                paid_leave_rate         INTEGER,
                transfer                TEXT,

                -- 給与・賞与・年収シミュレーション（AI推定）
                salary                  TEXT,
                bonus                   TEXT,
                expected_first_salary   INTEGER,
                salary_upper            INTEGER,
                years_to_recover        REAL,

                -- 未経験・採用可能性（AI推定）
                inexperienced_ok        INTEGER DEFAULT 0,
                training_program        TEXT,
                hiring_probability_score INTEGER,

                -- 技術・キャリア成長（AIスコア）
                job_description         TEXT,
                skill_stack             TEXT,
                tech_growth_score       INTEGER,
                career_growth_score     INTEGER,
                career_path             TEXT,

                -- 福利厚生・AI分析結果（JSONテキスト）
                benefits                TEXT,
                summary                 TEXT,
                strengths_weaknesses    TEXT,
                interview_strategy      TEXT,
                scores                  TEXT,

                -- 選考管理（ユーザー手動入力）
                status                  TEXT NOT NULL DEFAULT '検討中',
                source                  TEXT,
                applied_at              TEXT,
                notes                   TEXT,
                motivation              TEXT,
                created_at              TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );

            -- =========================================================
            -- schedules: 面接スケジュール（Googleカレンダー連携用）
            -- =========================================================
            CREATE TABLE IF NOT EXISTS schedules (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id       INTEGER NOT NULL,
                event_title      TEXT NOT NULL,
                interview_format TEXT,
                interviewer      TEXT,
                interview_notes  TEXT,
                result           TEXT,
                start_time       TEXT NOT NULL,
                -- カレンダーイベントIDで重複管理。手動登録時はNULL
                google_event_id  TEXT UNIQUE,
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            );

            -- =========================================================
            -- user_profile: ユーザー自身の情報（1行固定）
            -- 通勤時間算出・採用可能性・年収回復年数の個人最適化に使用
            -- =========================================================
            CREATE TABLE IF NOT EXISTS user_profile (
                id               INTEGER PRIMARY KEY CHECK (id = 1),
                home_address     TEXT,
                commute_mode     TEXT,
                current_salary   INTEGER,
                experience_years INTEGER DEFAULT 0,
                current_skills   TEXT,
                desired_role     TEXT,
                -- AIがこのキーワードを含む求人を低スコア扱いにする
                ng_keywords      TEXT
            );

            -- =========================================================
            -- user_profile の初期レコード（郡山市字原中・年収600万）
            -- INSERT OR IGNORE で2重登録を防ぐ
            -- =========================================================
            INSERT OR IGNORE INTO user_profile (
                id, home_address, commute_mode, current_salary,
                experience_years, desired_role, ng_keywords
            ) VALUES (
                1,
                '福島県郡山市字原中',
                'car',
                600,
                0,
                'バックエンドエンジニア（自社開発・受託）',
                '["SES","コールセンター","携帯販売","テレアポ"]'
            );
        """)
        conn.commit()

        # 既存DBへの追加カラムマイグレーション（ADD COLUMN は冪等ではないためtry/exceptで対応）
        _safe_add_columns(conn, "companies", [
            ("job_sources",           "TEXT DEFAULT '[]'"),  # 求人元タグ JSON配列
            ("commute_data",          "TEXT"),                # 通勤データ JSON (車/新幹線/電車)
            ("qualification_support", "TEXT"),                # 資格補助・支援制度
            ("beginner_description",  "TEXT"),                # 初心者向け業務説明（AI生成）
        ])

        print("[OK] データベースの初期化が完了しました")
    finally:
        conn.close()


def _safe_add_columns(conn, table: str, columns: list[tuple[str, str]]) -> None:
    """既存テーブルにカラムがなければ追加する（既にある場合はスキップ）。"""
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    for col_name, col_def in columns:
        if col_name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}")
    conn.commit()


if __name__ == "__main__":
    init_db()
