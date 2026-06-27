#!/usr/bin/env python3

import json
import os
import time
from datetime import datetime, timezone

import requests

# ── Config ────────────────────────────────────────────────────────────────────

REPO        = "is-a-dev/register"
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

# ── Helpers ───────────────────────────────────────────────────────────────────

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def fetch_contributor_stats() -> list:
    """
    Fetch /stats/contributors. GitHub computes this asynchronously —
    if it returns 202, we wait and retry until we get 200.
    """
    url = f"https://api.github.com/repos/{REPO}/stats/contributors"
    for attempt in range(10):
        r = requests.get(url, headers=HEADERS, timeout=30)
        if r.status_code == 202:
            print(f"  GitHub is computing stats, waiting 5s … (attempt {attempt+1})", flush=True)
            time.sleep(5)
            continue
        if r.status_code == 204:
            print("  No stats available yet.", flush=True)
            return []
        r.raise_for_status()
        return r.json()
    raise RuntimeError("GitHub stats endpoint kept returning 202 after 10 attempts")


def week_to_month_key(ts: int) -> str:
    """Convert a Unix week timestamp to YYYY-MM key of the month it falls in."""
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    return f"{dt.year}-{dt.month:02d}"


def this_month_key() -> str:
    now = now_utc()
    return f"{now.year}-{now.month:02d}"


def last_month_key() -> str:
    now = now_utc()
    y, m = now.year, now.month
    if m == 1:
        y, m = y - 1, 12
    else:
        m -= 1
    return f"{y}-{m:02d}"

# ── Cache ─────────────────────────────────────────────────────────────────────

def load_cache() -> dict:
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE) as f:
            return json.load(f)
    return {}


def save_cache(cache: dict):
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not GITHUB_TOKEN:
        raise RuntimeError("GITHUB_TOKEN not set")

    cache = load_cache()
    print("Fetching contributor stats (single API call) …", flush=True)
    stats = fetch_contributor_stats()

    if not stats:
        print("No stats returned, aborting.", flush=True)
        return

    maintainers_lower = {m.lower(): m for m in MAINTAINERS}
    this_key = this_month_key()
    last_key = last_month_key()

    # Build monthly totals per maintainer from the weekly data
    # weekly_data: { "username": { "YYYY-MM": total_commits } }
    weekly_data = {}
    for contributor in stats:
        login = (contributor.get("author") or {}).get("login", "")
        if not login or login.lower() not in maintainers_lower:
            continue

        canonical = maintainers_lower[login.lower()]
        monthly   = {}
        for week in contributor.get("weeks", []):
            commits = week.get("c", 0)
            if commits == 0:
                continue
            mk = week_to_month_key(week["w"])
            monthly[mk] = monthly.get(mk, 0) + commits

        weekly_data[canonical] = monthly
        print(f"  {canonical}: {sum(monthly.values())} total commits across {len(monthly)} active months", flush=True)

    # Merge into cache — update only months that changed
    for username, monthly in weekly_data.items():
        user_cache = cache.get(username, {})
        for mk, count in monthly.items():
            user_cache[mk] = count   # overwrite (stats endpoint is authoritative)
        cache[username] = user_cache

    save_cache(cache)
    print(f"\n✓ Cache saved to {CACHE_FILE}", flush=True)

    # Build output
    output = []
    for username in MAINTAINERS:
        user_cache = cache.get(username, {})
        all_time   = sum(user_cache.values())
        this_month = user_cache.get(this_key, 0)
        last_month = user_cache.get(last_key, 0)

        print(f"  {username}: all={all_time}  this_month={this_month}  last_month={last_month}", flush=True)
        output.append({
            "username": username,
            "stats": {
                "all_time":   all_time,
                "this_month": this_month,
                "last_month": last_month,
            },
            "last_updated": now_utc().isoformat(),
        })

    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"✓ Written to {OUTPUT_FILE}", flush=True)


if __name__ == "__main__":
    main()
