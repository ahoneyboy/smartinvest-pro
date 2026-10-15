"""共享 httpx 客户端 + 数据源健康状态注册表（供状态面板与自动降级使用）。"""
import asyncio
import time
from contextlib import asynccontextmanager
from typing import Any

import httpx

from .. import config


class SourceHealth:
    def __init__(self, name: str, role: str) -> None:
        self.name = name
        self.role = role  # 用途说明
        self.status = "unknown"  # ok / error / unknown
        self.last_success: str | None = None
        self.last_attempt: str | None = None
        self.last_latency_ms: float | None = None
        self.consecutive_failures = 0
        self.total_ok = 0
        self.total_fail = 0
        self.last_error: str | None = None

    def snapshot(self) -> dict:
        return {
            "name": self.name,
            "role": self.role,
            "status": self.status,
            "last_success": self.last_success,
            "last_attempt": self.last_attempt,
            "last_latency_ms": round(self.last_latency_ms, 1) if self.last_latency_ms else None,
            "consecutive_failures": self.consecutive_failures,
            "total_ok": self.total_ok,
            "total_fail": self.total_fail,
            "last_error": self.last_error,
        }

    def _ts(self) -> str:
        return time.strftime("%Y-%m-%d %H:%M:%S")

    def record_success(self, latency_ms: float) -> None:
        self.status = "ok"
        self.last_success = self._ts()
        self.last_attempt = self.last_success
        self.last_latency_ms = latency_ms
        self.consecutive_failures = 0
        self.total_ok += 1

    def record_failure(self, err: str) -> None:
        self.last_attempt = self._ts()
        self.last_error = err[:200]
        self.consecutive_failures += 1
        self.total_fail += 1
        self.status = "error"


class SourceRegistry:
    def __init__(self) -> None:
        self._health: dict[str, SourceHealth] = {}
        self._client: httpx.AsyncClient | None = None

    def register(self, name: str, role: str) -> SourceHealth:
        if name not in self._health:
            self._health[name] = SourceHealth(name, role)
        return self._health[name]

    def all(self) -> list[dict]:
        return [h.snapshot() for h in self._health.values()]

    @asynccontextmanager
    async def track(self, name: str, role: str = ""):
        """用法：async with registry.track("腾讯行情", "实时股价") as resp。"""
        h = self.register(name, role)
        start = time.perf_counter()
        try:
            yield h
        except (asyncio.TimeoutError, httpx.TimeoutException) as e:
            h.record_failure(f"超时({config.HTTP_TIMEOUT}s): {type(e).__name__}")
            raise
        except httpx.HTTPError as e:
            h.record_failure(f"{type(e).__name__}: {e}")
            raise
        except Exception as e:  # noqa: BLE001
            h.record_failure(str(e))
            raise
        else:
            h.record_success((time.perf_counter() - start) * 1000)

    async def start(self) -> None:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=config.HTTP_TIMEOUT,
                limits=httpx.Limits(max_connections=64, max_keepalive_connections=16),
                headers={"User-Agent": "Mozilla/5.0 (SmartInvestPro/1.0)"},
                follow_redirects=True,
            )

    async def stop(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @property
    def client(self) -> httpx.AsyncClient:
        assert self._client is not None, "HTTP client not started"
        return self._client

    async def get_json(self, source: str, role: str, url: str, **kw) -> Any:
        async with self.track(source, role):
            r = await self.client.get(url, **kw)
            r.raise_for_status()
            return r.json()

    async def post_json(self, source: str, role: str, url: str, **kw) -> Any:
        async with self.track(source, role):
            r = await self.client.post(url, **kw)
            r.raise_for_status()
            return r.json()

    async def get_text(self, source: str, role: str, url: str, encoding: str | None = None, **kw) -> str:
        async with self.track(source, role):
            r = await self.client.get(url, **kw)
            r.raise_for_status()
            if encoding:
                return r.content.decode(encoding, errors="ignore")
            return r.text


registry = SourceRegistry()
