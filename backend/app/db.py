"""SQLite 持久化：自选股、复盘存档、笔记、聊天记录、设置、告警。"""
import sqlite3
import threading
from datetime import datetime

from . import config

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
    return _conn


def init() -> None:
    with _lock, get_conn() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS watchlist(
              code TEXT PRIMARY KEY,
              name TEXT DEFAULT '',
              group_name TEXT DEFAULT '全部',
              cost REAL DEFAULT 0,
              shares REAL DEFAULT 0,
              lower_price REAL DEFAULT 0,
              upper_price REAL DEFAULT 0,
              created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS review_cache(
              date TEXT PRIMARY KEY,
              payload TEXT NOT NULL,
              engine TEXT DEFAULT 'rule',
              created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS notes(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              date TEXT NOT NULL,
              content TEXT NOT NULL,
              created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS chat_history(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session TEXT DEFAULT 'default',
              role TEXT NOT NULL,
              content TEXT NOT NULL,
              created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS settings(
              key TEXT PRIMARY KEY,
              value TEXT
            );
            CREATE TABLE IF NOT EXISTS alerts(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              code TEXT NOT NULL,
              name TEXT DEFAULT '',
              kind TEXT NOT NULL,
              message TEXT NOT NULL,
              price REAL,
              created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS sector_history(
              date TEXT NOT NULL,
              label TEXT NOT NULL,
              name TEXT NOT NULL,
              score REAL,
              PRIMARY KEY(date, label, name)
            );
            CREATE TABLE IF NOT EXISTS paper_account(
              id INTEGER PRIMARY KEY,
              cash REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS paper_trades(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              code TEXT NOT NULL,
              name TEXT DEFAULT '',
              direction TEXT NOT NULL,
              price REAL NOT NULL,
              shares REAL NOT NULL,
              reason TEXT DEFAULT '',
              created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS paper_signals(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              code TEXT NOT NULL,
              name TEXT DEFAULT '',
              kind TEXT NOT NULL,
              message TEXT NOT NULL,
              price REAL,
              executed INTEGER DEFAULT 0,
              created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            """
        )


def query(sql: str, params: tuple = ()) -> list[dict]:
    with _lock:
        rows = get_conn().execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def execute(sql: str, params: tuple = ()) -> None:
    with _lock, get_conn() as c:
        c.execute(sql, params)


def executemany(sql: str, seq: list[tuple]) -> None:
    with _lock, get_conn() as c:
        c.executemany(sql, seq)


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
