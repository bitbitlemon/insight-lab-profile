import asyncio
import os
import statistics
import time
from collections import Counter, defaultdict

import httpx

from app.db import SessionLocal
from app.models import Member
from app.services.auth import create_jwt


BASE_URL = "http://127.0.0.1:8080"
CONCURRENCY = 90
SINGLE_DURATION_SEC = 20
MIXED_DURATION_SEC = 30

ENDPOINTS = {
    "tasks": "/api/tasks?page_size=500",
    "projects": "/api/projects?page_size=200",
    "members": "/api/members?page_size=500",
}


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int(len(ordered) * pct + 0.999999) - 1))
    return ordered[index]


def make_tokens() -> list[str]:
    with SessionLocal() as db:
        members = (
            db.query(Member)
            .filter(Member.status.in_(["active", "on_leave"]))
            .order_by(Member.role.desc(), Member.updated_at.desc())
            .all()
        )
        if not members:
            raise RuntimeError("no active member available for load-test token")
        print(f"load-test users: {len(members)} active/on_leave members")
        return [create_jwt(member.open_id, member.role, member.name, kind="access") for member in members]


async def run_case(name: str, paths: list[str], duration: int, tokens: list[str]) -> dict:
    latencies_by_endpoint: dict[str, list[float]] = defaultdict(list)
    status_by_endpoint: dict[str, Counter] = defaultdict(Counter)
    errors_by_endpoint: dict[str, int] = defaultdict(int)
    error_types_by_endpoint: dict[str, Counter] = defaultdict(Counter)
    stop_at = time.perf_counter() + duration
    next_index = 0
    lock = asyncio.Lock()

    async def worker(worker_index: int) -> None:
        nonlocal next_index
        headers = {"Authorization": f"Bearer {tokens[worker_index % len(tokens)]}"}
        limits = httpx.Limits(max_connections=4, max_keepalive_connections=4)
        timeout = httpx.Timeout(10.0, connect=5.0)
        async with httpx.AsyncClient(base_url=BASE_URL, headers=headers, limits=limits, timeout=timeout) as client:
            while time.perf_counter() < stop_at:
                async with lock:
                    path = paths[next_index % len(paths)]
                    next_index += 1
                endpoint = next(label for label, endpoint_path in ENDPOINTS.items() if endpoint_path == path)
                started = time.perf_counter()
                try:
                    response = await client.get(path)
                    elapsed_ms = (time.perf_counter() - started) * 1000
                    latencies_by_endpoint[endpoint].append(elapsed_ms)
                    status_by_endpoint[endpoint][response.status_code] += 1
                except Exception as exc:
                    errors_by_endpoint[endpoint] += 1
                    error_types_by_endpoint[endpoint][type(exc).__name__] += 1

    started = time.perf_counter()
    await asyncio.gather(*(worker(i) for i in range(CONCURRENCY)))
    elapsed = time.perf_counter() - started

    rows = {}
    for endpoint in ENDPOINTS:
        values = latencies_by_endpoint[endpoint]
        statuses = status_by_endpoint[endpoint]
        total = sum(statuses.values()) + errors_by_endpoint[endpoint]
        ok = statuses.get(200, 0)
        rows[endpoint] = {
            "requests": total,
            "ok": ok,
            "errors": errors_by_endpoint[endpoint],
            "statuses": dict(statuses),
            "error_types": dict(error_types_by_endpoint[endpoint]),
            "rps": total / elapsed if elapsed else 0,
            "p50_ms": statistics.median(values) if values else 0,
            "p95_ms": percentile(values, 0.95),
            "p99_ms": percentile(values, 0.99),
            "max_ms": max(values) if values else 0,
        }
    return {"case": name, "elapsed_sec": elapsed, "rows": rows}


async def run_case_single_client(client: httpx.AsyncClient, name: str, paths: list[str], duration: int) -> dict:
    latencies_by_endpoint: dict[str, list[float]] = defaultdict(list)
    status_by_endpoint: dict[str, Counter] = defaultdict(Counter)
    errors_by_endpoint: dict[str, int] = defaultdict(int)
    error_types_by_endpoint: dict[str, Counter] = defaultdict(Counter)
    stop_at = time.perf_counter() + duration
    next_index = 0
    lock = asyncio.Lock()

    async def worker() -> None:
        nonlocal next_index
        while time.perf_counter() < stop_at:
            async with lock:
                path = paths[next_index % len(paths)]
                next_index += 1
            endpoint = next(label for label, endpoint_path in ENDPOINTS.items() if endpoint_path == path)
            started = time.perf_counter()
            try:
                response = await client.get(path)
                elapsed_ms = (time.perf_counter() - started) * 1000
                latencies_by_endpoint[endpoint].append(elapsed_ms)
                status_by_endpoint[endpoint][response.status_code] += 1
            except Exception as exc:
                errors_by_endpoint[endpoint] += 1
                error_types_by_endpoint[endpoint][type(exc).__name__] += 1

    started = time.perf_counter()
    await asyncio.gather(*(worker() for _ in range(CONCURRENCY)))
    elapsed = time.perf_counter() - started

    rows = {}
    for endpoint in ENDPOINTS:
        values = latencies_by_endpoint[endpoint]
        statuses = status_by_endpoint[endpoint]
        total = sum(statuses.values()) + errors_by_endpoint[endpoint]
        ok = statuses.get(200, 0)
        rows[endpoint] = {
            "requests": total,
            "ok": ok,
            "errors": errors_by_endpoint[endpoint],
            "statuses": dict(statuses),
            "error_types": dict(error_types_by_endpoint[endpoint]),
            "rps": total / elapsed if elapsed else 0,
            "p50_ms": statistics.median(values) if values else 0,
            "p95_ms": percentile(values, 0.95),
            "p99_ms": percentile(values, 0.99),
            "max_ms": max(values) if values else 0,
        }
    return {"case": name, "elapsed_sec": elapsed, "rows": rows}


def print_result(result: dict) -> None:
    print(f"\nCASE {result['case']} elapsed={result['elapsed_sec']:.2f}s concurrency={CONCURRENCY}")
    print("endpoint  req  ok  err  rps   p50_ms  p95_ms  p99_ms  max_ms  statuses  error_types")
    for endpoint, row in result["rows"].items():
        if row["requests"] == 0:
            continue
        print(
            f"{endpoint:<8} {row['requests']:>5} {row['ok']:>5} {row['errors']:>4} "
            f"{row['rps']:>5.1f} {row['p50_ms']:>8.1f} {row['p95_ms']:>8.1f} "
            f"{row['p99_ms']:>8.1f} {row['max_ms']:>8.1f} {row['statuses']} {row['error_types']}"
        )


async def main() -> None:
    tokens = make_tokens()
    limits = httpx.Limits(max_connections=CONCURRENCY + 20, max_keepalive_connections=CONCURRENCY + 20)
    timeout = httpx.Timeout(10.0, connect=5.0)
    headers = {"Authorization": f"Bearer {tokens[0]}"}
    if os.environ.get("LOAD_TEST_MIXED_ONLY") != "1":
        async with httpx.AsyncClient(base_url=BASE_URL, headers=headers, limits=limits, timeout=timeout) as client:
            for name, path in ENDPOINTS.items():
                print_result(await run_case_single_client(client, f"{name}-single-user", [path], SINGLE_DURATION_SEC))
                await asyncio.sleep(2)
    print_result(await run_case("mixed-real-users", list(ENDPOINTS.values()), MIXED_DURATION_SEC, tokens))


if __name__ == "__main__":
    asyncio.run(main())
