import urllib.request
import json
import re

USERNAME = "notamitgamer"
API_URL = f"https://api.github.com/users/{USERNAME}/events/public?per_page=100"

def fetch_recent_commits():
    try:
        # Create a request object with a User-Agent (GitHub API requires it)
        req = urllib.request.Request(API_URL)
        req.add_header('User-Agent', f'{USERNAME}-readme-updater')
        
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())

        print(f"✅ Fetched {len(data)} recent events from GitHub API.")

        commits = []
        push_events_count = 0

        for event in data:
            # We only care about events where you pushed code
            if event['type'] == 'PushEvent':
                push_events_count += 1
                repo_name = event['repo']['name']
                
                # Safely get the commits list (defaults to an empty list if missing)
                commits_list = event['payload'].get('commits', [])
                
                for commit in commits_list:
                    # Extract the first line of the commit message (removes long descriptions)
                    msg = commit['message'].split('\n')[0]
                    
                    # The API returns an api.github.com URL, we need to convert it to a standard web URL
                    url = commit['url'].replace('api.github.com/repos', 'github.com').replace('/commits/', '/commit/')
                    
                    # Format as a markdown list item
                    commits.append(f"- [{msg}]({url}) in [{repo_name}](https://github.com/{repo_name})")
                    
                    # Stop once we have 5 commits
                    if len(commits) >= 5:
                        print(f"✅ Found 5 commits! Stopping search.")
                        return commits
                        
        print(f"⚠️ Found {push_events_count} PushEvents, containing a total of {len(commits)} commits.")
        return commits

    except Exception as e:
        print(f"Error fetching commits: {e}")
        return []

def update_readme(commits):
    if not commits:
        print("No commits found to update.")
        return

    # Format the commits back to standard markdown bullet points
    commit_list_md = "\n".join(commits)

    # Read the current README.md
    with open('README.md', 'r', encoding='utf-8') as f:
        readme = f.read()

    # Use regex to replace the tags and everything in between them
    updated_readme = re.sub(
        r"<!-- START_RECENT_COMMITS -->.*?<!-- END_RECENT_COMMITS -->",
        f"<!-- START_RECENT_COMMITS -->\n{commit_list_md}\n<!-- END_RECENT_COMMITS -->",
        readme,
        flags=re.DOTALL
    )

    # Write the updated content back to README.md
    with open('README.md', 'w', encoding='utf-8') as f:
        f.write(updated_readme)
    
    print("README.md successfully updated!")

if __name__ == "__main__":
    recent_commits = fetch_recent_commits()
    update_readme(recent_commits)
