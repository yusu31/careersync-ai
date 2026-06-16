"""
SQLite接続モジュール

get_connection() を呼ぶと careersync.db への接続が得られる。
row_factory を Row にすることで、カラム名でアクセスできるようになる。
"""

import sqlite3
from pathlib import Path

# DBファイルはプロジェクトルートに置く
DB_PATH = Path(__file__).parent.parent / "careersync.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    # カラム名でアクセスできるよう辞書ライクなRowオブジェクトを使う
    conn.row_factory = sqlite3.Row
    # 外部キー制約を有効化（SQLiteはデフォルトで無効）
    conn.execute("PRAGMA foreign_keys = ON")
    return conn
