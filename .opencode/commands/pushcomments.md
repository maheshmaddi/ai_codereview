---
description: Push code review comments to GitHub PR
agent: codereview-publisher
---

Read the review output from /codereview and push to GitHub PR #$ARGUMENTS.

Parse $ARGUMENTS as: `{pr_number}` (e.g., `142`)

## Step 1: Locate review output

Find the most recent review for this PR:
```
!`ls -t ~/.codereview-store/reviews/ | grep "PR-{pr_number}" | head -1`
```

Read the review comments:
```
Read: ~/.codereview-store/reviews/{review_dir}/review_comments.json
```

## Step 2: Extract repository info

Parse from review_comments.json:
- `pr_number`
- `repository` (format: `org/project`)
- `overall_summary`
- `verdict`
- `comments` array

## Step 3: Map verdict to GitHub event

| verdict          | GitHub event      |
|------------------|-------------------|
| approve          | APPROVE           |
| request_changes  | REQUEST_CHANGES   |
| comment          | COMMENT           |

## Step 4: Format line comments

Transform each comment in the `comments` array:
```json
{
  "path": "{file}",
  "side": "RIGHT",
  "line": {end_line},
  "start_line": {start_line},
  "start_side": "RIGHT",
  "body": "[{SEVERITY}][{CATEGORY}] {body}"
}
```

Note: Only include `start_line` if it differs from `line` (multi-line comment).

## Step 5: Submit review to GitHub API

```
POST https://api.github.com/repos/{repository}/pulls/{pr_number}/reviews
Authorization: Bearer {GITHUB_TOKEN}
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28

{
  "body": "{overall_summary}",
  "event": "{APPROVE|REQUEST_CHANGES|COMMENT}",
  "comments": [{formatted_comments}]
}
```

Use `GITHUB_TOKEN` from the environment. Never log the token.

## Step 6: Handle errors and confirm

- If a line comment fails (invalid line), retry as a top-level comment without `path`/`line`
- Log the HTTP response status for each API call
- On success, output: `Review posted: https://github.com/{repository}/pull/{pr_number}#pullrequestreview-{review_id}`
- On failure, output the error details and suggest manual posting steps

## Step 7: Write audit log

Append to `~/.codereview-store/reviews/{review_dir}/push_log.json`:
```json
{
  "pushed_at": "{ISO-8601-timestamp}",
  "pr_number": {pr_number},
  "repository": "{repository}",
  "github_review_id": {review_id},
  "review_url": "{url}",
  "status": "success"
}
```
