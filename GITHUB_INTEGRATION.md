# GitHub Review Integration Guide

## Overview

The code review system automatically posts reviews to GitHub during generation via custom tool (`post_github_review`).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Code Review Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                           │
│  1. User triggers review                                   │
│     ├── Web UI (Check PRs button)                          │
│     └── Webhook (PR labeled)                              │
│                                                           │
│  2. codereview-executor agent runs                         │
│     ├── Fetches PR diff                                    │
│     ├── Loads review guidelines                              │
│     ├── Analyzes code                                      │
│     └── Generates review files:                              │
│         ├── review_summary.md                                │
│         └── review_comments.json                            │
│                                                           │
│  3. Automatic GitHub posting                                │
│     └── post_github_review tool is called                    │
│         ├── Reads review_comments.json                        │
│         ├── Posts to GitHub API                              │
│         └── Returns result                                 │
│                                                           │
└─────────────────────────────────────────────────────────────────┘
```

## Files Modified/Created

### Custom Tool (Automatic)
- `.opencode/tools/package.json` - Tool dependencies
- `.opencode/tools/post_github_review.ts` - GitHub posting tool
- `.opencode/agents/codereview-executor.md` - Updated to use tool
- `.opencode/commands/codereview.md` - Updated documentation

### Server API (Manual)
- `server/src/routes/github-publisher.ts` - Existing manual posting
- `server/src/lib/store.ts` - Review file reading
- `web/src/lib/api.ts` - API client functions
- `web/src/components/push-to-github-button.tsx` - UI component

## Configuration

Required:
```
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

Token permissions needed:
- `repo` (full control of private repositories) OR
- `pull_request:write` (for PR access)

## Database Schema

### Reviews Table

```sql
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  pr_title TEXT NOT NULL,
  pr_url TEXT NOT NULL,
  repository TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  verdict TEXT NOT NULL,
  comment_count INTEGER NOT NULL,
  review_dir TEXT NOT NULL,
  review_output TEXT,
  github_review_id INTEGER,
  created_at TEXT NOT NULL
);
```

Fields:
- `review_dir`: Path to review files
- `review_output`: JSON blob of review data (for backup)
- `github_review_id`: ID from GitHub after posting (currently not set by auto-posting)

## Error Handling

### Automatic (Tool)
- Logs errors to console
- Continues without failing review generation
- No user notification
- Success: tool returns success object
- Failure: tool returns error object

## Future Enhancements

1. **Retry Logic**: Add automatic retry on rate limit errors
2. **Batch Posting**: Post multiple reviews in one operation
3. **Review Templates**: Allow customizing review format
4. **Comment Limits**: Respect GitHub API limits (300 comments/review)
5. **Audit Trail**: Log all posting attempts in database
6. **Webhook Status**: Track posting status for webhooks

## Troubleshooting

### Auto posting not working

Check:
1. Tool file exists: `.opencode/tools/post_github_review.ts`
2. Tool enabled in agent config
3. `GITHUB_TOKEN` is set
4. Review files are being generated

### Reviews posted twice

This can happen if:
1. Tool is called multiple times
2. Review generation is retried

Solution:
- Check if review already exists before posting
- Ensure tool is only called once per review

### GitHub API rate limits

GitHub limits:
- 5000 requests/hour for authenticated requests
- 300 comments per review

If rate limited:
- Wait for reset time
- Use personal access tokens with higher limits
- Contact GitHub for rate limit increase

## Security Considerations

1. **Token Storage**
   - Never commit `GITHUB_TOKEN` to repo
   - Use environment variables or secret management
   - Rotate tokens regularly

2. **Token Permissions**
   - Use minimal required permissions
   - Use `pull_request:write` instead of full `repo` if possible
   - Revoke unused tokens

3. **Repository Access**
   - Token should only access needed repositories
   - Use separate tokens for different projects
   - Monitor token usage logs

## Support

For issues or questions:
- Check GitHub Actions logs (if using workflows)
- Check server logs for manual posting
- Check opencode logs for auto posting
- Review error messages for specific issues
