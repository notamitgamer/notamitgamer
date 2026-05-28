import urllib.request
import json
import re
import os
from datetime import datetime

USERNAME = "notamitgamer"

def fetch_recent_commits():
    commits_data = []
    try:
        search_url = f"https://api.github.com/search/commits?q=author:{USERNAME}&sort=author-date&order=desc&per_page=15"
        req = urllib.request.Request(search_url)
        req.add_header('User-Agent', f'{USERNAME}-readme-updater')
        req.add_header('Accept', 'application/vnd.github+json')

        # Use GITHUB_TOKEN if available to avoid rate limits
        token = os.environ.get('GITHUB_TOKEN')
        if token:
            req.add_header('Authorization', f'token {token}')

        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())

        items = data.get('items', [])
        print(f"🔍 Search API returned {len(items)} commits.")

        for item in items:
            date_str = item['commit']['author']['date']
            date_obj = datetime.fromisoformat(date_str)

            msg = item['commit']['message'].split('\n')[0]
            commit_url = item['html_url']

            # Extract repo name from the commit URL
            # e.g. https://github.com/owner/repo/commit/sha
            parts = commit_url.split('/')
            repo_name = f"{parts[3]}/{parts[4]}"
            repo_url = f"https://github.com/{repo_name}"

            commits_data.append({
                'date': date_obj,
                'markdown': f"- [{msg}]({commit_url}) in [{repo_name}]({repo_url})"
            })

        # Sort by date descending
        commits_data.sort(key=lambda x: x['date'], reverse=True)

        # Deduplicate (search can return same commit across multiple branches)
        seen = set()
        unique_commits = []
        for c in commits_data:
            if c['markdown'] not in seen:
                seen.add(c['markdown'])
                unique_commits.append(c)

        final_commits = [c['markdown'] for c in unique_commits[:5]]
        print(f"✅ Found {len(final_commits)} recent commits.")
        return final_commits

    except Exception as e:
        print(f"Error fetching data: {e}")
        return []


def update_readme(commits):
    if not commits:
        print("No commits found to update.")
        return

    commit_list_md = "\n".join(commits)

    with open('README.md', 'r', encoding='utf-8') as f:
        readme = f.read()

    updated_readme = re.sub(
        r"<!-- START_RECENT_COMMITS -->.*?<!-- END_RECENT_COMMITS -->",
        f"<!-- START_RECENT_COMMITS -->\n{commit_list_md}\n<!-- END_RECENT_COMMITS -->",
        readme,
        flags=re.DOTALL
    )

    with open('README.md', 'w', encoding='utf-8') as f:
        f.write(updated_readme)

    print("✅ README.md successfully updated!")


if __name__ == "__main__":
    recent_commits = fetch_recent_commits()
    update_readme(recent_commits)
