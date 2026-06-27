#!/usr/bin/env python3
"""
Fetches PR activity for tracked maintainers from is-a-dev/register
and writes the results to maintainers.json.

Uses the GitHub Search API to find PRs each maintainer interacted with
(reviewed, commented, merged, closed, labelled) — much faster than
paginating every PR in the repo.
"""

import json
import os
import time
from datetime import datetime, timezone

import requests

# ── Config ────────────────────────────────────────────────────────────────────

REPO = "is-a-dev/register"

MAINTAINERS = [
    "Yunexiz",
    "wdhdev",
    "STICKnoLOGIC",
    "Stef-00012",
    "satr14washere",
    "orangci",
    "omsenjalia",
    "notamitgamer",
    "iostpa",
    "dragsbruh",
    "DEV-DIBSTER",
]

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
OUTPUT_FILE = "maintainers.json"

HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}
if GITHUB_TOKEN:
    HEADERS["Authorization"] = f"Bearer {GITHUB_TOKEN}"

# ── Helpers ───────────────────────────────────────────────────────────────────

def get(url: str, params: dict = None):
    while True:
        r = requests.get(url, headers=HEADERS, params=params, timeout=30)
        if r.status_code == 403 and "rate limit" in r.text.lower():
            reset = int(r.headers.get("X-RateLimit-Reset", time.time() + 60))
            wait = max(reset - int(time.time()), 5)
            print(f"  Rate limited – sleeping {wait}s …", flush=True)
            time.sleep(wait)
            continue
        if r.status_code == 422:
            # Search index not available for this query, return empty
            return {"items": [], "total_count": 0}
        r.raise_for_status()
        return r.json()


def search_prs(query: str) -> set[int]:
    """Return set of PR numbers matching a GitHub search query."""
    pr_numbers = set()
    page = 1
    while True:
        data = get(
            "https://api.github.com/search/issues",
            {"q": query, "per_page": 100, "page": page},
        )
        items = data.get("items", [])
        for item in items:
            pr_numbers.add(item["number"])
        print(f"    page {page}: {len(items)} results (total so far: {len(pr_numbers)})", flush=True)
        if len(items) < 100:
            break
        page += 1
        time.sleep(0.5)  # be kind to search rate limits
    return pr_numbers


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def month_bounds(offset: int = 0):
    """Return (start_str, end_str) in YYYY-MM-DD for use in GitHub search."""
    today = now_utc().replace(day=1)
    year, month = today.year, today.month
    month += offset
    while month <= 0:
        month += 12
        year -= 1
    while month > 12:
        month -= 12
        year += 1
    start = today.replace(year=year, month=month)
    end_month = month + 1
    end_year = year
    if end_month > 12:
        end_month = 1
        end_year += 1
    end = start.replace(year=end_year, month=end_month)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


# ── Per-maintainer search ─────────────────────────────────────────────────────

def get_pr_count(username: str, date_filter: str = "") -> int:
    """
    Count distinct PRs in REPO that `username` interacted with
    (reviewed, commented, merged/closed) but did NOT author.

    date_filter: e.g. "2025-06-01..2025-07-01" or "" for all time.
    """
    base = f"repo:{REPO} is:pr -author:{username}"
    date_part = f" updated:{date_filter}" if date_filter else ""

    queries = [
        f"{base} reviewed-by:{username}{date_part}",
        f"{base} commenter:{username}{date_part}",
    ]

    pr_set = set()
    for q in queries:
        print(f"  Searching: {q}", flush=True)
        pr_set |= search_prs(q)
        time.sleep(1)  # GitHub search: 30 req/min for authenticated

    return len(pr_set)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    this_month_start, this_month_end = month_bounds(0)
    last_month_start, last_month_end = month_bounds(-1)
    updated_at = now_utc().isoformat()

    output = []
    for username in MAINTAINERS:
        print(f"\n── {username} ──", flush=True)

        all_time   = get_pr_count(username)
        this_month = get_pr_count(username, f"{this_month_start}..{this_month_end}")
        last_month = get_pr_count(username, f"{last_month_start}..{last_month_end}")

        print(f"  → all={all_time}  this_month={this_month}  last_month={last_month}", flush=True)

        output.append({
            "username": username,
            "stats": {
                "all_time":   all_time,
                "this_month": this_month,
                "last_month": last_month,
            },
            "last_updated": updated_at,
        })

    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n✓ Written to {OUTPUT_FILE}", flush=True)


if __name__ == "__main__":
    main()
