# GitHub Review Poster Tool

## Overview

A custom OpenCode tool that automatically posts code review comments to GitHub PRs after the review is generated.

## Files Created

### 1. `.opencode/tools/package.json`
Package configuration for custom tools with required dependencies:
- `@opencode-ai/plugin` (for tool definitions)
- `octokit` (for GitHub API access)

### 2. `.opencode/tools/post_github_review.ts`
The custom tool that:
- Reads `review_comments.json` from the review output directory
- Posts the review to GitHub using the GitHub REST API
- Supports all verdict types: `approve`, `request_changes`, `comment`
- Maps review comments to GitHub diff comments
- Returns success/failure information with error details

## Tool Features

### Automatic Field Mapping
- Reads from `review_comments.json` in the specified directory
- Parses PR number and repository from the file
- Maps severity and category to comment body prefix

### GitHub API Integration
- Uses Octokit library for authenticated requests
- Requires `GITHUB_TOKEN` environment variable
- Posts review with:
  - Overall summary as review body
  - Individual comments as diff comments
  - Correct event type based on verdict

### Error Handling
- Validates review file existence and format
- Checks for required fields
- Provides detailed error messages for:
  - Missing GITHUB_TOKEN
  - Invalid repository format
  - GitHub API errors (401, 403, 404)
  - Generic API failures

## Usage

The tool is automatically enabled for the `codereview-executor` agent. It runs after generating review files:

```
1. Generate review_summary.md
2. Generate review_comments.json
3. Call post_github_review tool with review directory
4. Tool reads review_comments.json
5. Tool posts to GitHub PR
6. Return success/error result
```

## Configuration

### Required Environment Variable
```
GITHUB_TOKEN=your_github_personal_access_token
```

The token must have `pull_request:write` permissions.

### Permissions
The tool respects OpenCode's permission system. Since `opencode.json` has `"permission": "allow"`, the tool runs automatically.

## Agent Updates

### codereview-executor.md
Updated to:
1. Enable the `post_github_review` tool
2. Add Step 6 to call the tool after file generation
3. Handle failures gracefully (log error, continue)

### codereview.md
Updated to document the auto-posting step in the command flow.

## Testing

To test the tool manually:

```bash
# Set your GitHub token
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Run a code review
opencode run --command codereview --dir /path/to/repo 42 org/project
```

The review will be automatically posted to GitHub after generation.

## Output Example

Success:
```json
{
  "success": true,
  "github_review_id": 123456789,
  "pr_number": 42,
  "repository": "org/project",
  "verdict": "request_changes",
  "comment_count": 5,
  "review_url": "https://github.com/org/project/pull/42#pullrequestreview-123456789",
  "message": "Successfully posted review to PR #42"
}
```

Error:
```json
{
  "success": false,
  "error": "GITHUB_TOKEN environment variable not set",
  "details": "Please configure it to post reviews to GitHub"
}
```

## Troubleshooting

### Tool not found
- Ensure `.opencode/tools/post_github_review.ts` exists
- Run `npm install` in `.opencode/tools/` to install dependencies
- Restart OpenCode

### GitHub authentication failed
- Verify GITHUB_TOKEN is set
- Check token has `pull_request:write` permissions
- Regenerate token if it has expired

### Permission denied (403)
- Token lacks required permissions
- Repository access restrictions
- Rate limiting (wait and retry)

### PR not found (404)
- Wrong PR number in review file
- Repository name doesn't match
- PR was deleted or closed
