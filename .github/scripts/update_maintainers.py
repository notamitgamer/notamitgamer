#!/usr/bin/env python3
"""
Fetches PR activity for tracked maintainers from is-a-dev/register
and writes the results to maintainers.json.

Activity counted (excluding PRs the maintainer themselves opened):
  - PR reviews (approved, changes requested, commented)
  - PR review comments
  - Issue comments on PRs
  - Merging a PR
  - Closing a PR (without merge)
  - Adding labels to a PR
"""

import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from collections import defaultdict

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

# ── Helpers ───────────────────────────────────────────────────────────────────

HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}
if GITHUB_TOKEN:
    HEADERS["Authorization"] = f"Bearer {GITHUB_TOKEN}"

MAINTAINERS_LOWER = {m.lower() for m in MAINTAINERS}


def get(url: str, params: dict = None) -> dict | list:
    """GET with basic rate-limit handling."""
    while True:
        r = requests.get(url, headers=HEADERS, params=params, timeout=30)
        if r.status_code == 403 and "rate limit" in r.text.lower():
            reset = int(r.headers.get("X-RateLimit-Reset", time.time() + 60))
            wait = max(reset - int(time.time()), 5)
            print(f"  Rate limited – sleeping {wait}s …", flush=True)
            time.sleep(wait)
            continue
        r.raise_for_status()
        return r.json()


def paginate(url: str, params: dict = None) -> list:
    """Fetch all pages from a GitHub list endpoint."""
    params = dict(params or {})
    params.setdefault("per_page", 100)
    results = []
    page = 1
    while True:
        params["page"] = page
        chunk = get(url, params)
        if not chunk:
            break
        results.extend(chunk)
        if len(chunk) < params["per_page"]:
            break
        page += 1
    return results


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def month_bounds(offset: int = 0):
    """
    Return (start, end) for a calendar month.
    offset=0 → current month so far
    offset=-1 → last month
    """
    today = now_utc().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # shift months
    year, month = today.year, today.month
    month += offset
    while month <= 0:
        month += 12
        year -= 1
    while month > 12:
        month -= 12
        year += 1
    start = today.replace(year=year, month=month)
    # end = first day of next month
    end_month = month + 1
    end_year = year
    if end_month > 12:
        end_month = 1
        end_year += 1
    end = start.replace(year=end_year, month=end_month)
    return start, end


# ── Core fetch logic ──────────────────────────────────────────────────────────

def fetch_all_prs() -> list:
    """Fetch every PR (open + closed) from the repo."""
    print("Fetching all PRs …", flush=True)
    prs = paginate(
        f"https://api.github.com/repos/{REPO}/pulls",
        {"state": "all", "sort": "updated", "direction": "desc"},
    )
    print(f"  → {len(prs)} PRs fetched", flush=True)
    return prs


def is_maintainer(username: str) -> bool:
    return username and username.lower() in MAINTAINERS_LOWER


def canonical(username: str) -> str:
    """Return the correctly-cased username from MAINTAINERS list."""
    for m in MAINTAINERS:
        if m.lower() == username.lower():
            return m
    return username


def collect_activities(prs: list) -> list[dict]:
    """
    For each PR not authored by a maintainer, collect all maintainer
    interactions: reviews, review-comments, issue-comments, merge, close, labels.

    Returns a flat list of:
        { "username": str, "pr_number": int, "type": str, "created_at": datetime }
    """
    activities = []
    total = len(prs)

    for i, pr in enumerate(prs, 1):
        pr_number = pr["number"]
        pr_author = (pr.get("user") or {}).get("login", "")
        print(f"  [{i}/{total}] PR #{pr_number} by {pr_author}", flush=True)

        base = f"https://api.github.com/repos/{REPO}"

        # ── Reviews ──────────────────────────────────────────────────────────
        reviews = paginate(f"{base}/pulls/{pr_number}/reviews")
        for rev in reviews:
            user = (rev.get("user") or {}).get("login", "")
            if is_maintainer(user) and user.lower() != pr_author.lower():
                submitted = rev.get("submitted_at") or rev.get("created_at")
                if submitted:
                    activities.append({
                        "username": canonical(user),
                        "pr_number": pr_number,
                        "type": "review",
                        "created_at": datetime.fromisoformat(submitted.replace("Z", "+00:00")),
                    })

        # ── Review comments (inline) ──────────────────────────────────────────
        review_comments = paginate(f"{base}/pulls/{pr_number}/comments")
        seen_review_comment_pr = set()
        for rc in review_comments:
            user = (rc.get("user") or {}).get("login", "")
            if is_maintainer(user) and user.lower() != pr_author.lower():
                key = (canonical(user), pr_number, "review_comment")
                if key not in seen_review_comment_pr:
                    seen_review_comment_pr.add(key)
                    created = rc.get("created_at", "")
                    if created:
                        activities.append({
                            "username": canonical(user),
                            "pr_number": pr_number,
                            "type": "review_comment",
                            "created_at": datetime.fromisoformat(created.replace("Z", "+00:00")),
                        })

        # ── Issue comments (general PR comments) ─────────────────────────────
        issue_comments = paginate(f"{base}/issues/{pr_number}/comments")
        seen_issue_comment_pr = set()
        for ic in issue_comments:
            user = (ic.get("user") or {}).get("login", "")
            if is_maintainer(user) and user.lower() != pr_author.lower():
                key = (canonical(user), pr_number, "comment")
                if key not in seen_issue_comment_pr:
                    seen_issue_comment_pr.add(key)
                    created = ic.get("created_at", "")
                    if created:
                        activities.append({
                            "username": canonical(user),
                            "pr_number": pr_number,
                            "type": "comment",
                            "created_at": datetime.fromisoformat(created.replace("Z", "+00:00")),
                        })

        # ── Merge ─────────────────────────────────────────────────────────────
        if pr.get("merged_at"):
            merged_by = (pr.get("merged_by") or {}).get("login", "")
            if is_maintainer(merged_by) and merged_by.lower() != pr_author.lower():
                merged_at = pr["merged_at"]
                activities.append({
                    "username": canonical(merged_by),
                    "pr_number": pr_number,
                    "type": "merge",
                    "created_at": datetime.fromisoformat(merged_at.replace("Z", "+00:00")),
                })

        # ── Close (without merge) ─────────────────────────────────────────────
        if pr.get("state") == "closed" and not pr.get("merged_at"):
            closed_at = pr.get("closed_at", "")
            if closed_at:
                # GitHub doesn't expose who closed a PR directly on the PR object.
                # We derive it from the timeline events.
                events = paginate(f"{base}/issues/{pr_number}/events")
                for ev in events:
                    if ev.get("event") == "closed":
                        closer = (ev.get("actor") or {}).get("login", "")
                        if is_maintainer(closer) and closer.lower() != pr_author.lower():
                            activities.append({
                                "username": canonical(closer),
                                "pr_number": pr_number,
                                "type": "close",
                                "created_at": datetime.fromisoformat(
                                    ev["created_at"].replace("Z", "+00:00")
                                ),
                            })

        # ── Labels ────────────────────────────────────────────────────────────
        events = paginate(f"{base}/issues/{pr_number}/events")
        seen_label_pr = set()
        for ev in events:
            if ev.get("event") == "labeled":
                labeler = (ev.get("actor") or {}).get("login", "")
                if is_maintainer(labeler) and labeler.lower() != pr_author.lower():
                    key = (canonical(labeler), pr_number, "label")
                    if key not in seen_label_pr:
                        seen_label_pr.add(key)
                        activities.append({
                            "username": canonical(labeler),
                            "pr_number": pr_number,
                            "type": "label",
                            "created_at": datetime.fromisoformat(
                                ev["created_at"].replace("Z", "+00:00")
                            ),
                        })

    return activities


# ── Dedup & count ─────────────────────────────────────────────────────────────

def count_unique_prs(activities: list, username: str, since: datetime = None, until: datetime = None) -> int:
    """Count distinct PRs a maintainer interacted with, optionally within a date range."""
    pr_set = set()
    for act in activities:
        if act["username"] != username:
            continue
        ts = act["created_at"]
        if since and ts < since:
            continue
        if until and ts >= until:
            continue
        pr_set.add(act["pr_number"])
    return len(pr_set)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    prs = fetch_all_prs()

    print("Collecting maintainer activities …", flush=True)
    activities = collect_activities(prs)
    print(f"  → {len(activities)} activity records collected", flush=True)

    # Date bounds
    this_month_start, this_month_end = month_bounds(0)
    last_month_start, last_month_end = month_bounds(-1)
    updated_at = now_utc().isoformat()

    output = []
    for username in MAINTAINERS:
        all_time   = count_unique_prs(activities, username)
        this_month = count_unique_prs(activities, username, since=this_month_start, until=this_month_end)
        last_month = count_unique_prs(activities, username, since=last_month_start, until=last_month_end)

        output.append({
            "username": username,
            "stats": {
                "all_time":   all_time,
                "this_month": this_month,
                "last_month": last_month,
            },
            "last_updated": updated_at,
        })
        print(f"  {username}: all={all_time}  this_month={this_month}  last_month={last_month}", flush=True)

    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n✓ Written to {OUTPUT_FILE}", flush=True)


if __name__ == "__main__":
    main()
