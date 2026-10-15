"""进程内 TTL 缓存（行情短缓存 + 复盘聚合缓存）。"""
import time
from typing import Any


class TTLCache:
    def __init__(self) -> None:
        self._data: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        item = self._data.get(key)
        if not item:
            return None
        ts, val = item
        return val  # 返回值但调用方自行判断新鲜度

    def get_fresh(self, key: str, ttl: float) -> Any | None:
        item = self._data.get(key)
        if not item:
            return None
        ts, val = item
        if time.time() - ts <= ttl:
            return val
        return None

    def stale_age(self, key: str) -> float | None:
        item = self._data.get(key)
        if not item:
            return None
        return time.time() - item[0]

    def set(self, key: str, val: Any) -> None:
        self._data[key] = (time.time(), val)

    def delete(self, key: str) -> None:
        self._data.pop(key, None)


cache = TTLCache()
