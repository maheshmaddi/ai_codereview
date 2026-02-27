# GitHub Comment Publisher Tool

## Overview

This tool enables posting code review comments from the OpenCode Code Review system to GitHub Pull Requests as inline comments.

## Features

- **Automatic Push**: Push review comments to GitHub with a single click
- **GitHub Integration**: Uses GitHub REST API to post comments
- **Line Comments**: Posts inline comments on specific code lines
- **Verdict Mapping**: Maps review verdicts to GitHub review events:
  - `approve` → APPROVE
  - `request_changes` → REQUEST_CHANGES
  - `comment` → COMMENT
- **Status Tracking**: Tracks which reviews have been posted to GitHub

## API Endpoints

### POST `/api/github/push-review/:reviewId`

Push review comments to GitHub by review ID.

**Response:**
```json
{
  "success": true,
  "github_review_id": 123456,
  "review_url": "https://github.com/org/repo/pull/1#pullrequestreview-123456"
}
```

### POST `/api/github/push-review-by-pr/:projectId/:prNumber`

Push review comments to GitHub by project ID and PR number. This will find the most recent review for the specified PR.

**Example:**
```
POST /api/github/push-review-by-pr/github.com%2Forg%2Frepo/42
```

## How It Works

1. **Read Review Output**: Loads `review_comments.json` from the review directory
2. **Parse Comments**: Extracts PR number, repository, summary, verdict, and line comments
3. **Format Comments**: Transforms comments into GitHub API format
4. **Submit to GitHub**: Posts review via GitHub REST API
5. **Update Database**: Stores the GitHub review ID to prevent duplicate posting

## Usage

### Via Web UI

1. Navigate to a project's history page
2. Find the review you want to publish
3. Click "Push to GitHub" button
4. Comments are posted to the PR automatically

### Via API

```bash
# Push by review ID
curl -X POST http://localhost:3001/api/github/push-review/{reviewId}

# Push by PR number
curl -X POST http://localhost:3001/api/github/push-review-by-pr/{projectId}/{prNumber}
```

## Prerequisites

- **GITHUB_TOKEN**: Must be set in `server/.env` with `pull_request` write permissions
- **Review Output**: A completed review must exist in the `~/.codereview-store/reviews/` directory

## Comment Format

Line comments include severity and category tags for visibility:

```
[HIGH][SECURITY] Password is not being hashed before storage...
[MEDIUM][PERFORMANCE] Consider using memoization here...
```

## Error Handling

- **Invalid Line Numbers**: Falls back to posting as top-level comment
- **Permission Errors**: Returns 403 with details about required permissions
- **Not Found**: Returns 404 if PR or repository doesn't exist
- **Already Posted**: Returns 400 if review has already been pushed to GitHub

## Security

- GitHub token is never logged
- All API requests use HTTPS
- Token has the minimum required permissions (pull_request write)

## Components

- **Backend**: `server/src/routes/github-publisher.ts`
- **Frontend**: `web/src/components/push-to-github-button.tsx`
- **API Client**: `web/src/lib/api.ts` (pushReviewToGitHub functions)
