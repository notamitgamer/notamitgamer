import urllib.request
import json
import re
from datetime import datetime

USERNAME = "notamitgamer"

def fetch_recent_commits():
    commits_data = []
    try:
        # Events API captures activity across ALL repos, including orgs
        events_url = f"https://api.github.com/users/{USERNAME}/events/public?per_page=100"
        req = urllib.request.Request(events_url)
        req.add_header('User-Agent', f'{USERNAME}-readme-updater')

        with urllib.request.urlopen(req) as response:
            events = json.loads(response.read().decode())

        for event in events:
            # Only look at PushEvents (covers direct pushes + merged PRs)
            if event.get('type') != 'PushEvent':
                continue

            repo_name = event['repo']['name']  # e.g. "is-a-dev/register"
            commits = event['payload'].get('commits', [])

            for commit in commits:
                # Filter to only YOUR commits by email or name
                author = commit.get('author', {})
                if author.get('name', '').lower() != USERNAME.lower() and \
                   USERNAME.lower() not in author.get('email', '').lower():
                    continue

                date_str = event['created_at']
                date_obj = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%SZ")

                msg = commit['message'].split('\n')[0]
                sha = commit['sha']
                commit_url = f"https://github.com/{repo_name}/commit/{sha}"
                repo_url = f"https://github.com/{repo_name}"

                commits_data.append({
                    'date': date_obj,
                    'markdown': f"- [{msg}]({commit_url}) in [{repo_name}]({repo_url})"
                })

        commits_data.sort(key=lambda x: x['date'], reverse=True)
        final_commits = [c['markdown'] for c in commits_data[:5]]

        print(f"Found {len(final_commits)} recent commits across all repositories.")
        return final_commits

    except Exception as e:
        print(f"Error fetching data: {e}")
        return []
