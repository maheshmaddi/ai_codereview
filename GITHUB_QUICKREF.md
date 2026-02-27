# GitHub Review Auto-Posting - Quick Reference

## What Was Built

A custom OpenCode tool that automatically posts code reviews to GitHub after they're generated.

## Key Files

| File | Purpose |
|------|---------|
| `.opencode/tools/post_github_review.ts` | The custom tool |
| `.opencode/tools/package.json` | Tool dependencies |
| `.opencode/agents/codereview-executor.md` | Updated to use tool |
| `.opencode/commands/codereview.md` | Updated documentation |

## Setup

```bash
# 1. Install tool dependencies (already done)
cd .opencode/tools && npm install

# 2. Set your GitHub token
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# 3. Run a review (auto-posts now!)
opencode run --command codereview --dir /path/to/repo 42 org/project
```

## How It Works

```
Review Generation → Create Files → Auto-Post to GitHub → Done
     ↓                      ↓                    ↓
codereview-executor    review_comments.json   post_github_review tool
                      review_summary.md
```

## Features

✅ Automatic posting after review generation
✅ Supports all verdict types (approve/request_changes/comment)
✅ Posts individual comments as diff comments
✅ Comprehensive error handling
✅ Graceful failure (doesn't break review generation)
✅ Works with web UI and webhook triggers

## Error Handling

| Scenario | Behavior |
|-----------|----------|
| No GITHUB_TOKEN | Logs error, review files created |
| Invalid token | Returns auth error, review files created |
| PR not found | Returns 404, review files created |
| Rate limit | Returns error, review files created |
| Any error | Logs detailed message, continues |

## Testing

```bash
# Test with a real PR
export GITHUB_TOKEN=your_token
opencode run --command codereview --dir /path/to/repo 123 org/repo

# Check GitHub for the review
# Should be posted automatically
```

## Troubleshooting

**Tool not found?**
- Check `.opencode/tools/post_github_review.ts` exists
- Restart OpenCode

**Posting fails?**
- Verify `GITHUB_TOKEN` is set
- Check token has `pull_request:write` permissions
- Review error messages in logs

**Review files not created?**
- Check agent logs for errors
- Verify PR diff is accessible
- Check file system permissions

## Documentation

Full documentation available:
- `GITHUB_REVIEW_TOOL.md` - Implementation details
- `GITHUB_REVIEW_TEST.md` - Testing procedures
- `GITHUB_INTEGRATION.md` - Architecture and integration guide
- `GITHUB_AUTOPOST_SUMMARY.md` - Complete summary

## Next Steps

To use:
1. Set `GITHUB_TOKEN` environment variable
2. Trigger a review (web UI or webhook)
3. Review automatically posts to GitHub
4. Check PR on GitHub for feedback

That's it! 🎉
