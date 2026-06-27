#!/usr/bin/env python3
import json
import os
import time
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

# ── Config ────────────────────────────────────────────────────────────────────

REPO        = "is-a-dev/register"
REPO_START  = (2020, 10)   # October 2020
CACHE_FILE  = "pr_cache.json"
OUTPUT_FILE = "maintainers.json"

MAINTAINERS = [
    "Yunexiz", "wdhdev", "STICKnoLOGIC", "Stef-00012",
    "satr14washere", "orangci", "omsenjalia", "notamitgamer",
    "iostpa", "dragsbruh", "DEV-DIBSTER",
]

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Authorization": f"Bearer {GITHUB_TOKEN}",
}

# ── Date helpers ──────────────────────────────────────────────────────────────

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def next_month(y: int, m: int) -> tuple[int, int]:
    return (y + 1, 1) if m == 12 else (y, m + 1)

def prev_month(y: int, m: int) -> tuple[int, int]:
    return (y - 1, 12) if m == 1 else (y, m - 1)

def month_key(y: int, m: int) -> str:
    return f"{y}-{m:02d}"

def month_range_str(y: int, m: int) -> tuple[str, str]:
    ny, nm = next_month(y, m)
    return f"{y}-{m:02d}-01", f"{ny}-{nm:02d}-01"

def all_months() -> list[tuple[int, int]]:
    """All months from REPO_START up to and including current month."""
    now = now_utc()
    months = []
    y, m = REPO_START
    while (y, m) <= (now.year, now.month):
        months.append((y, m))
        y, m = next_month(y, m)
    return months

# ── Cache helpers ─────────────────────────────────────────────────────────────

def load_cache() -> dict:
    """
    Cache structure:
    {
      "USERNAME": {
        "2020-10": 5,
        "2020-11": 12,
        ...
      },
      ...
    }
    """
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE) as f:
            return json.load(f)
    return {}

def save_cache(cache: dict):
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)

# ── GitHub Search ─────────────────────────────────────────────────────────────

def fetch_ids(query: str) -> set[int]:
    """Fetch all PR numbers matching a search query (handles pagination)."""
    ids = set()
    page = 1
    while True:
        while True:
            r = requests.get(
                "https://api.github.com/search/issues",
                headers=HEADERS,
                params={"q": query, "per_page": 100, "page": page},
                timeout=30,
            )
            if r.status_code in (403, 429):
                reset = int(r.headers.get("X-RateLimit-Reset", time.time() + 30))
                wait  = max(reset - int(time.time()), 10)
                print(f"    Rate limited – sleeping {wait}s …", flush=True)
                time.sleep(wait)
                continue
            if r.status_code == 422:
                return ids
            r.raise_for_status()
            break

        data  = r.json()
        items = data.get("items", [])
        for item in items:
            ids.add(item["number"])
        if len(items) < 100:
            break
        page += 1
        time.sleep(0.5)
    return ids


def count_for_month(username: str, y: int, m: int) -> int:
    """Count distinct closed PRs a maintainer interacted with in a given month."""
    start, end = month_range_str(y, m)
    base  = f"repo:{REPO} is:pr is:closed -author:{username}"
    date  = f"closed:{start}..{end}"

    rev_ids = fetch_ids(f"{base} reviewed-by:{username} {date}")
    time.sleep(0.5)
    com_ids = fetch_ids(f"{base} commenter:{username} {date}")
    time.sleep(0.5)

    return len(rev_ids | com_ids)

# ── Per-maintainer update ─────────────────────────────────────────────────────

def update_maintainer(username: str, cache: dict) -> dict:
    print(f"\n── {username} ──", flush=True)

    user_cache = cache.get(username, {})
    now        = now_utc()
    cur_key    = month_key(now.year, now.month)

    for (y, m) in all_months():
        key = month_key(y, m)
        # Always re-fetch current month (still growing). Skip all others if cached.
        if key in user_cache and key != cur_key:
            print(f"  {key}: cached={user_cache[key]} (skip)", flush=True)
            continue

        count = count_for_month(username, y, m)
        user_cache[key] = count
        print(f"  {key}: fetched={count}", flush=True)

    cache[username] = user_cache

    # Compute stats from cache
    all_time = sum(user_cache.values())

    py, pm   = prev_month(now.year, now.month)
    this_month = user_cache.get(month_key(now.year, now.month), 0)
    last_month = user_cache.get(month_key(py, pm), 0)

    print(f"  ✓ all={all_time}  this_month={this_month}  last_month={last_month}", flush=True)

    return {
        "username": username,
        "stats": {
            "all_time":   all_time,
            "this_month": this_month,
            "last_month": last_month,
        },
        "last_updated": now_utc().isoformat(),
    }

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not GITHUB_TOKEN:
        raise RuntimeError("GITHUB_TOKEN not set")

    cache = load_cache()
    print(f"Loaded cache for {len(cache)} maintainers.\n", flush=True)

    results  = {}
    # max_workers=2 to stay within Search API rate limits (30 req/min)
    with ThreadPoolExecutor(max_workers=2) as ex:
        futures = {ex.submit(update_maintainer, u, cache): u for u in MAINTAINERS}
        for future in as_completed(futures):
            u = futures[future]
            try:
                results[u] = future.result()
            except Exception as e:
                print(f"  ✗ {u} failed: {e}", flush=True)
                results[u] = {
                    "username": u,
                    "stats": {"all_time": 0, "this_month": 0, "last_month": 0},
                    "last_updated": now_utc().isoformat(),
                }

    # Save updated cache
    save_cache(cache)
    print(f"\n✓ Cache saved to {CACHE_FILE}", flush=True)

    # Write output
    output = [results[u] for u in MAINTAINERS if u in results]
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)
    print(f"✓ Written to {OUTPUT_FILE}", flush=True)


if __name__ == "__main__":
    main()
