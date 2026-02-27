# Test Procedure for GitHub Review Poster Tool

## Prerequisites

1. Set up a test repository with a test PR
2. Generate a code review for that PR
3. Verify the tool posts correctly

## Manual Testing

### Step 1: Verify Tool is Loaded

```bash
# Start opencode
cd /path/to/ai_codereview
opencode

# Check if tool is available (it should show post_github_review)
```

### Step 2: Generate a Test Review

```bash
# Set your GitHub token
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Run a code review on a PR
opencode run --command codereview --dir /path/to/repo 42 org/project
```

### Step 3: Verify Output

The agent should:
1. Generate `review_summary.md`
2. Generate `review_comments.json`
3. Call `post_github_review` tool
4. Display tool output (success or error)

### Step 4: Check GitHub

Navigate to the PR on GitHub and verify:
- Review is posted
- Summary appears as review body
- Individual comments appear on the diff
- Verdict matches (approve/request_changes/comment)

## Error Scenarios to Test

### No GITHUB_TOKEN

```bash
# Unset the token
unset GITHUB_TOKEN

# Run review - should get error message
opencode run --command codereview --dir /path/to/repo 42 org/project
```

Expected: Tool returns error about missing token, but review generation succeeds.

### Invalid Token

```bash
# Use an invalid token
export GITHUB_TOKEN=invalid_token

# Run review
opencode run --command codereview --dir /path/to/repo 42 org/project
```

Expected: Tool returns authentication error (401).

### No PR Permissions

```bash
# Use a token without pull_request:write permissions
export GITHUB_TOKEN=token_with_limited_permissions

# Run review
opencode run --command codereview --dir /path/to/repo 42 org/project
```

Expected: Tool returns permission denied error (403).

### Non-existent PR

Modify `review_comments.json` to have a PR number that doesn't exist, then test.

Expected: Tool returns not found error (404).

## Success Criteria

✅ Tool is automatically called after review generation
✅ Review is posted to GitHub correctly
✅ All comments appear as diff comments
✅ Summary appears as review body
✅ Verdict is correctly mapped (APPROVE/REQUEST_CHANGES/COMMENT)
✅ Error messages are clear and helpful
✅ Review generation succeeds even if GitHub posting fails

## Notes

- The tool should fail gracefully if GitHub posting fails
- Review files should still be created even if posting fails
- Error messages should help users diagnose issues
- Tool output should include GitHub review URL on success
