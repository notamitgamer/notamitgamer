#!/usr/bin/env python3
import json
import os
import time
from datetime import datetime, timezone

import requests

# ── Config ────────────────────────────────────────────────────────────────────

REPO        = "is-a-dev/register"
REPO_START  = (2020, 10)
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
    """Returns ISO timestamps for start/end of a month."""
    ny, nm = next_month(y, m)
    return f"{y}-{m:02d}-01T00:00:00Z", f"{ny}-{nm:02d}-01T00:00:00Z"

def all_months() -> list[tuple[int, int]]:
    now = now_utc()
    months = []
    y, m = REPO_START
    while (y, m) <= (now.year, now.month):
        months.append((y, m))
        y, m = next_month(y, m)
    return months

# ── Cache ─────────────────────────────────────────────────────────────────────

def load_cache() -> dict:
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE) as f:
            return json.load(f)
    return {}

def save_cache(cache: dict):
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)

# ── GitHub Commits API ────────────────────────────────────────────────────────

def count_commits(username: str, since: str, until: str) -> int:
    """Count commits by a user in a date range using pagination."""
    url    = f"https://api.github.com/repos/{REPO}/commits"
    count  = 0
    page   = 1
    while True:
        while True:
            r = requests.get(url, headers=HEADERS, params={
                "author":   username,
                "since":    since,
                "until":    until,
                "per_page": 100,
                "page":     page,
            }, timeout=30)

            remaining = int(r.headers.get("X-RateLimit-Remaining", 10))
            reset_at  = int(r.headers.get("X-RateLimit-Reset", time.time() + 60))

            if r.status_code in (403, 429) or remaining == 0:
                wait = max(reset_at - int(time.time()), 5)
                print(f"    Rate limited – sleeping {wait}s …", flush=True)
                time.sleep(wait + 2)
                continue

            r.raise_for_status()

            if remaining < 10:
                wait = max(reset_at - int(time.time()), 5)
                print(f"    Low requests ({remaining} left) – sleeping {wait}s …", flush=True)
                time.sleep(wait + 2)
            break

        items  = r.json()
        count += len(items)
        if len(items) < 100:
            break
        page += 1
        time.sleep(0.3)

    return count

# ── Per-maintainer update ─────────────────────────────────────────────────────

def update_maintainer(username: str, cache: dict) -> dict:
    print(f"\n── {username} ──", flush=True)

    user_cache = cache.get(username, {})
    now        = now_utc()
    cur_key    = month_key(now.year, now.month)

    for (y, m) in all_months():
        key = month_key(y, m)
        if key in user_cache and key != cur_key:
            print(f"  {key}: {user_cache[key]} (cached)", flush=True)
            continue

        since, until   = month_range_str(y, m)
        count          = count_commits(username, since, until)
        user_cache[key] = count
        print(f"  {key}: {count} (fetched)", flush=True)

        # Save after every month so progress isn't lost on interruption
        cache[username] = user_cache
        save_cache(cache)

    py, pm     = prev_month(now.year, now.month)
    all_time   = sum(user_cache.values())
    this_month = user_cache.get(cur_key, 0)
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
    print(f"Loaded cache for {len(cache)} maintainer(s).\n", flush=True)

    results = {}
    for username in MAINTAINERS:
        try:
            results[username] = update_maintainer(username, cache)
        except Exception as e:
            print(f"  ✗ {username} failed: {e}", flush=True)
            results[username] = {
                "username": username,
                "stats": {"all_time": 0, "this_month": 0, "last_month": 0},
                "last_updated": now_utc().isoformat(),
            }

    output = [results[u] for u in MAINTAINERS if u in results]
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n✓ Written to {OUTPUT_FILE}", flush=True)


if __name__ == "__main__":
    main()
