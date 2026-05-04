import urllib.request
import json
import re
from datetime import datetime

USERNAME = "notamitgamer"

def fetch_recent_commits():
    commits_data = []
    try:
        # 1. Get the repos you recently pushed to
        repos_url = f"https://api.github.com/users/{USERNAME}/repos?sort=pushed&per_page=5"
        req = urllib.request.Request(repos_url)
        req.add_header('User-Agent', f'{USERNAME}-readme-updater')

        with urllib.request.urlopen(req) as response:
            repos = json.loads(response.read().decode())

        # 2. For each repo, get your recent commits
        for repo in repos:
            repo_name = repo['name']
            # Query commits authored specifically by your username
            commits_url = f"https://api.github.com/repos/{USERNAME}/{repo_name}/commits?author={USERNAME}&per_page=5"
            
            try:
                c_req = urllib.request.Request(commits_url)
                c_req.add_header('User-Agent', f'{USERNAME}-readme-updater')
                with urllib.request.urlopen(c_req) as c_response:
                    repo_commits = json.loads(c_response.read().decode())
                    
                    for commit in repo_commits:
                        # Parse date for sorting
                        date_str = commit['commit']['author']['date']
                        date_obj = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%SZ")
                        
                        # Extract message and the direct web URL
                        msg = commit['commit']['message'].split('\n')[0]
                        url = commit['html_url']
                        
                        commits_data.append({
                            'date': date_obj,
                            'markdown': f"- [{msg}]({url}) in [{repo_name}](https://github.com/{USERNAME}/{repo_name})"
                        })
            except Exception as e:
                print(f"Skipping commits for {repo_name} due to error: {e}")
                continue

        # 3. Sort all collected commits by date descending (newest first)
        commits_data.sort(key=lambda x: x['date'], reverse=True)

        # 4. Extract just the markdown strings for the top 5
        final_commits = [c['markdown'] for c in commits_data[:5]]
        
        print(f"✅ Successfully found {len(final_commits)} recent commits across your repositories.")
        return final_commits

    except Exception as e:
        print(f"Error fetching data: {e}")
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
