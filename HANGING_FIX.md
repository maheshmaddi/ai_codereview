# Code Review Hanging Issue Fix

## Problem

The code review process is getting stuck at "⏳ Processing..." and never completes. This is happening because:

1. **No Timeout**: The `opencode run` command runs indefinitely without a timeout
2. **Model Name Issue**: The model name `glm-4.7-flash z.AI coding plan` contains spaces which may cause parsing issues
3. **Large Diff**: The PR diff might be too large for the model to process efficiently

## Solutions

### Solution 1: Fix Model Name

The current model name has spaces which is invalid. Change it to a proper format:

**Current (Invalid):**
```
glm-4.7-flash z.AI coding plan
```

**Fixed (Valid):**
```
zai-coding-plan/glm-4.7-flash
```

### Solution 2: Add Timeout to Review Process

Add a timeout mechanism to prevent indefinite hanging:

```typescript
// In pr-check.ts, add timeout
const REVIEW_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

const timeoutPromise = new Promise<never>((_, reject) => {
  setTimeout(() => reject(new Error('Review timed out after 10 minutes')), REVIEW_TIMEOUT_MS)
})

try {
  const exitCode = await Promise.race([
    runReviewCLI(tempDir, prNumber, owner, repo),
    timeoutPromise
  ])
  // Handle exit code
} catch (err) {
  if (err instanceof Error && err.message.includes('timed out')) {
    // Handle timeout
    sendEvent('error', { message: 'Review timed out. Try again or limit diff size.' })
  }
}
```

### Solution 3: Limit Diff Size

Check diff size before processing:

```bash
# Get diff line count
git diff --stat origin/base...origin/pr | wc -l

# If too large (>5000 lines), limit to:
# - Only changed files (not context)
# - Or show warning and ask user to split review
```

### Solution 4: Use a Faster Model

For large diffs, use a faster model:

```
zai-coding-plan/glm-4-flash  # Faster but less detailed
```

### Solution 5: Add Progress Indicators

Show progress during review:

```typescript
// Track file-by-file progress
const processedFiles = 0;
const totalFiles = changedFiles.length;

// Send periodic updates
setInterval(() => {
  const progress = (processedFiles / totalFiles * 100).toFixed(0)
  sendEvent('progress', { message: `Analyzing... ${progress}%` })
}, 5000)
```

## Immediate Actions

### 1. Fix the Model Name (Required)

Update the model in the database:

```bash
# Via API
curl -X PATCH http://localhost:3001/api/settings \
  -H "Content-Type: application/json" \
  -d '{"review_model":"zai-coding-plan/glm-4.7-flash"}'

# Via UI
Go to: http://localhost:3000/settings
Change model to: zai-coding-plan/glm-4.7-flash
```

### 2. Kill the Stuck Process

```bash
# Find and kill the stuck process
tasklist | findstr opencode
taskkill /F /PID <process_id>
```

### 3. Reduce Project Settings

Update project settings to limit review scope:

```bash
curl -X PATCH http://localhost:3001/api/projects/{projectId}/settings \
  -H "Content-Type: application/json" \
  -d '{
    "max_diff_lines": 2000,
    "excluded_paths": ["node_modules/", "dist/", ".git/", "build/"]
  }'
```

## Recommended Model Settings

Based on PR size, use appropriate models:

**Small PRs (< 500 lines)**: 
- `zai-coding-plan/glm-4.7-flash` - Fast, good quality

**Medium PRs (500-2000 lines)**:
- `zai-coding-plan/glm-4-turbo` - Balanced speed/quality

**Large PRs (> 2000 lines)**:
- Use smaller context (limit to critical files only)
- Consider manual review or split PR

## Long-term Improvements

### 1. Add Timeout Configuration

Add to `server/.env`:
```env
REVIEW_TIMEOUT_MINUTES=10
MAX_DIFF_LINES=5000
```

### 2. Implement Streaming Reviews

Stream review output in real-time:
```typescript
// Show results as they're generated
// Don't wait for complete review
// Better UX for large reviews
```

### 3. Add Diff Pre-processing

```typescript
async function preprocessDiff(diff: string) {
  const lines = diff.split('\n')
  
  // Check size
  if (lines.length > MAX_DIFF_LINES) {
    // Truncate or warn
    return diff.split('\n').slice(0, MAX_DIFF_LINES).join('\n')
  }
  
  // Remove noise (whitespace, comments)
  return cleanDiff(diff)
}
```

### 4. Implement Retry Logic

```typescript
const MAX_RETRIES = 2
let retryCount = 0

async function runReviewWithRetry() {
  try {
    return await runReview()
  } catch (err) {
    if (retryCount < MAX_RETRIES && isRetryableError(err)) {
      retryCount++
      return await runReviewWithRetry()
    }
    throw err
  }
}
```

## Current Status

The review is stuck because:
- ✅ Repository cloned successfully
- ✅ Command started
- ❌ Model name is invalid (has spaces)
- ❌ No timeout mechanism
- ❌ Stuck waiting for response

## Step-by-Step Fix

1. **Fix Model Name** (Do this first):
   ```bash
   curl -X PATCH http://localhost:3001/api/settings \
     -H "Content-Type: application/json" \
     -d '{"review_model":"zai-coding-plan/glm-4.7-flash"}'
   ```

2. **Kill Stuck Process**:
   ```bash
   # Open Task Manager or run:
   taskkill /F /IM opencode.exe
   ```

3. **Retry the Review**:
   ```bash
   # In the UI, click "Check PRs" again
   ```

## Monitoring

Add these to help debug future issues:

```typescript
// Log processing time
const startTime = Date.now()
// ... process ...
const duration = Date.now() - startTime
console.log(`Review completed in ${duration}ms`)

// Log diff size
const diffSize = diff.split('\n').length
console.log(`Diff size: ${diffSize} lines`)
```

## Best Practices

1. **Validate Inputs**: Check model names before sending
2. **Set Timeouts**: Never run indefinite processes
3. **Monitor Progress**: Track file-by-file progress
4. **Handle Errors**: Graceful degradation on large inputs
5. **Log Everything**: Debug info for troubleshooting
