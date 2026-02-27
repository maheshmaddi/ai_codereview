---
description: Execute AI code review on a PR diff
agent: codereview-executor
---

Execute a code review for PR #$ARGUMENTS on this repository.

Parse $ARGUMENTS as: `{pr_number} {repository}` (e.g., `142 org/project-name`)
If repository is not provided, detect from: `!`git remote get-url origin``

## Step 1: Prepare the environment

Parse the $ARGUMENTS to get:
- pr_number: First argument (e.g., `142`)
- repository: Second argument (e.g., `org/project-name`)

If repository is not provided, detect from: `!`git remote get-url origin``

Run post-clone setup scripts if a `settings.json` exists in the project store:
```
~/.codereview-store/projects/{host}/{org}/{project}/settings.json
```

## Step 2: Get the diff

Fetch the PR branch and compute the diff:
```
!`git fetch origin pull/{pr_number}/head:pr-{pr_number}`
!`git checkout pr-{pr_number}`
!`git diff origin/main...pr-{pr_number} --name-only`
!`git diff origin/main...pr-{pr_number} --stat`
!`git diff origin/main...pr-{pr_number}`
```

If the diff exceeds 5000 lines, focus on:
1. Files with the most changes
2. Newly added files
3. Changes to security-critical paths (auth, permissions, data access)

## Step 3: Load review guidelines

Determine the centralized store path from the git remote URL.

Load the root review guidelines:
```
Read: ~/.codereview-store/projects/{host}/{org}/{project}/{project}_codereview.md
```

Load the index to identify relevant modules:
```
Read: ~/.codereview-store/projects/{host}/{org}/{project}/codereview_index.json
```

For each changed file, match against the module paths in the index. Load all matched module review files:
```
Read: ~/.codereview-store/projects/{host}/{org}/{project}/modules/{module}_codereview.md
```

If no guidelines exist, proceed with general best practices and note the absence.

## Step 4: Perform the review

Review the diff against ALL loaded guidelines. For each changed file, check:

1. **Correctness**: Does the logic match the stated intent?
2. **Security**: Any OWASP Top 10 violations? Auth bypass? Injection risks?
3. **Performance**: N+1 queries? Missing indexes? Blocking async calls?
4. **Code Quality**: Readability, maintainability, SOLID principles, DRY violations?
5. **Testing**: Are new code paths tested? Are edge cases covered?
6. **Documentation**: Are public APIs and complex logic documented?
7. **Breaking Changes**: Any API contract violations?

## Step 5: Generate review output

Create the review output directory:
```
~/.codereview-store/reviews/{YYYY-MM-DD}_PR-{pr_number}_{project}/
```

Write `review_summary.md` with:
- PR title and number
- Repository and branch info
- Executive summary of the review
- Verdict with rationale
- List of all issues by severity

Write `review_comments.json`:
```json
{
  "pr_number": {pr_number},
  "repository": "{org/project}",
  "reviewed_at": "{ISO-8601-timestamp}",
  "overall_summary": "## Code Review Summary\n\n...",
  "verdict": "request_changes",
  "comments": [
    {
      "file": "src/auth/login.service.ts",
      "start_line": 45,
      "end_line": 52,
      "severity": "HIGH",
      "category": "SECURITY",
      "body": "Password is not being hashed before storage. Use bcrypt with a minimum cost factor of 12."
    }
  ]
}
```

Valid severity values: `HIGH`, `MEDIUM`, `LOW`
Valid category values: `SECURITY`, `PERFORMANCE`, `BUG`, `CODE_QUALITY`, `TESTING`, `DOCUMENTATION`

## Step 6: Post review to GitHub

After generating the review files, automatically post the review to GitHub using the `post_github_review` tool:

```
Use the post_github_review tool with the review directory path as argument
```

The tool will read `review_comments.json` from the review directory and post the review to GitHub.

If the tool fails (e.g., no GITHUB_TOKEN configured), log the error but do not fail the entire review process.

## Step 7: Output completion

Output the path to the generated review files on completion.
