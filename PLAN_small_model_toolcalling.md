# Plan: Tool-Calling Code Review for Small Models (GLM-4-Flash)

## Problem Statement

The current code review works as a "one-shot" prompt: the model receives the full PR diff (up to 5000 lines), all project guidelines, and must produce structured JSON in a single response. This fails with small models like GLM-4-Flash because:

1. **Context overload** – the combined diff + guidelines easily exceeds 32K tokens
2. **Single-shot structured output** – producing a precise `review_comments.json` with correct file paths and line numbers in one pass is hard for smaller models
3. **No recovery path** – if the model loses track mid-response, the entire output is malformed
4. **No incremental progress** – work done so far is lost if the session times out or errors

## Core Insight: Agentic Tool-Calling Loop

Instead of one massive prompt → one massive JSON output, we restructure the review as an **agentic loop** where the model calls tools step-by-step:

```
list changed files → (for each file) get diff → get guidelines → write comment → next file → set verdict
```

Each step involves a small, focused context. The model calls tools (bash, read, write) to navigate the PR rather than holding everything in memory. Comments are written immediately after each file — no accumulation required.

This is how modern LLM agents work: **tools replace memory**.

---

## Architecture Overview

```
PR labeled / webhook / poll
        │
        ▼
[server] Detect model size (isSmallModel?)
        │
   ┌────┴────┐
   │         │
Large      Small
model      model
   │         │
   ▼         ▼
/codereview  Pre-process diff into per-file chunks
             Write manifest.json to review dir
             ▼
             /codereview-small (new command)
             ▼
             codereview-executor-small agent (new)
             Reviews ONE file per tool-call cycle:
               bash: git diff -- {file}  (reads chunk)
               read: load matching guideline section
               write: append comment to comments.jsonl
             ▼
             Merge comments.jsonl → review_comments.json
             ▼
/pushcomments (unchanged)
```

---

## Files to Create / Modify

### 1. NEW: `.opencode/agents/codereview-executor-small.md`

A new subagent optimized for small models. Key differences from the existing `codereview-executor.md`:

- **File-by-file loop**: explicit instruction to process one file per iteration
- **Incremental writes**: append each comment to `comments.jsonl` immediately after reviewing the file — do not accumulate in memory
- **JSONL output**: one JSON object per line is far more reliable for small models than a nested array
- **Minimal guideline loading**: only load the guideline section matching the current file's module (one `grep` call, not full file reads)
- **Simpler comment format**: fewer required fields, no nested arrays, flat objects
- **Explicit tool call sequence**: the prompt tells the model exactly which tool to call at each step

Agent frontmatter:
```yaml
mode: subagent
temperature: 0.0        # deterministic — small models drift at higher temps
tools:
  bash: true            # git diff per file, append comments
  read: true            # read pre-chunked diff files and guidelines
  grep: true            # find relevant guideline sections
  write: true           # append to comments.jsonl
```

Core prompt loop (pseudocode the agent follows):
```
1. bash: cat {review_dir}/chunks/manifest.json   → file list
2. FOR each file in file list:
   a. bash: cat {review_dir}/chunks/{file_chunk}.diff
   b. grep: find guideline lines matching this file path
   c. Analyze (small context: just this file's diff + matched guideline lines)
   d. IF issues found:
      bash: echo '{...comment json...}' >> {review_dir}/comments.jsonl
3. bash: determine overall verdict from comments.jsonl
4. write: {review_dir}/review_summary.md
5. bash: python3 -c "..." or jq to convert comments.jsonl → review_comments.json
```

### 2. NEW: `.opencode/commands/codereview-small.md`

A new command that orchestrates the small-model review flow:

- Accepts same arguments as `/codereview`: `{pr_number} {repository}`
- **Step 1**: fetch PR metadata via `gh pr view`
- **Step 2**: run `git diff` and split into per-file chunk files under `{review_dir}/chunks/`
- **Step 3**: write `chunks/manifest.json` with `[{file, path_safe, additions, deletions}]`
- **Step 4**: initialize empty `comments.jsonl` 
- **Step 5**: invoke `codereview-executor-small` agent
- **Step 6**: merge/validate `comments.jsonl` → `review_comments.json`
- **Step 7**: call `/pushcomments {pr_number}`

The diff splitting in Step 2 uses only bash tools available to OpenCode:
```bash
git diff origin/{base}...origin/{pr_branch} --name-only | while read f; do
  safe=$(echo "$f" | tr '/' '__')
  git diff origin/{base}...origin/{pr_branch} -- "$f" > \
    {review_dir}/chunks/${safe}.diff
done
```

### 3. NEW: `server/src/lib/diff-splitter.ts`

A TypeScript utility (used server-side when triggering reviews programmatically):

```typescript
export interface DiffChunk {
  file: string          // original file path
  pathSafe: string      // filesystem-safe name (slashes → __)
  additions: number
  deletions: number
  chunkPath: string     // absolute path to the .diff chunk file
}

export async function splitDiff(
  repoDir: string,
  baseBranch: string,
  prBranch: string,
  outputDir: string
): Promise<DiffChunk[]>
```

This pre-processes the diff before the agent starts, so the agent only needs `bash: cat {chunk}` instead of computing the diff itself.

### 4. MODIFY: `server/src/lib/opencode-client.ts`

Add model classification and command routing:

```typescript
// Keywords that indicate a small/limited-context model
const SMALL_MODEL_KEYWORDS = [
  'flash', 'mini', 'small', 'tiny', 'lite',
  'glm-4-flash', '7b', '8b', '9b', '13b', 'phi', 'gemma'
]

export function isSmallModel(modelId: string): boolean {
  const lower = modelId.toLowerCase()
  return SMALL_MODEL_KEYWORDS.some(k => lower.includes(k))
}

// Returns 'codereview' for large models, 'codereview-small' for small models
export function selectReviewCommand(modelId: string): string {
  return isSmallModel(modelId) ? 'codereview-small' : 'codereview'
}
```

The `runCommand` / `runCommandInDir` functions already read `getGlobalSetting('review_model')` — update them to call `selectReviewCommand()` and pass the right command name.

### 5. MODIFY: `server/src/routes/webhook.ts`

Change the command selection when triggering a review:
```typescript
// Before:
const command = 'codereview'

// After:
const model = getGlobalSetting('review_model') ?? ''
const command = selectReviewCommand(model)
```

### 6. MODIFY: `server/src/lib/github-poller.ts`

Same change as webhook.ts — use `selectReviewCommand(model)` when triggering reviews via polling.

### 7. MODIFY: `server/src/routes/pr-check.ts`

Same change for manually triggered PR reviews.

---

## Why Tool Calling Makes Small Models Viable

| Aspect | One-Shot (Current) | Tool-Calling (Proposed) |
|--------|-------------------|------------------------|
| Context per step | Full diff + all guidelines (5000+ lines) | One file diff + matched guideline lines (~100-300 lines) |
| Output complexity | One massive nested JSON object | One flat JSON line per comment |
| Failure mode | Entire review lost on error | Only the current file's comment lost |
| Line number accuracy | Must track across 5000-line diff | Only within a single file's diff |
| Memory requirement | High (must remember all files seen) | None (each file is independent) |
| Guideline loading | All modules upfront | Grep for relevant lines only |

---

## Sequence Diagram

```
Webhook/Poller → server
  → getGlobalSetting('review_model')        → "zhipu/glm-4-flash"
  → isSmallModel("zhipu/glm-4-flash")       → true
  → splitDiff(repo, base, pr, reviewDir)    → writes chunks/
  → runCommand('codereview-small', args)    → OpenCode session
      → codereview-executor-small agent
          → bash: cat manifest.json
          → LOOP per file:
              → bash: cat chunks/src__auth__login.diff
              → grep: guidelines matching "src/auth/"
              → [small model reasons over ~200 lines]
              → bash: echo '{comment}' >> comments.jsonl
          → END LOOP
          → bash: determine verdict
          → write: review_summary.md
          → bash: convert jsonl → review_comments.json
  → /pushcomments → GitHub API
```

---

## What We Are NOT Changing

- `codereview-executor.md` — large model workflow unchanged
- `/codereview` command — unchanged, still used for large models
- `codereview-publisher.md` — publishing to GitHub unchanged
- Database schema — no changes needed
- Web UI — no changes needed
- The `review_comments.json` output format — same schema, so `/pushcomments` works as-is

---

## Acceptance Criteria

1. A PR review triggered with model `zhipu/glm-4-flash` uses the `codereview-small` command path
2. The review produces a valid `review_comments.json` in the same schema as before
3. The review produces a `review_summary.md`
4. `/pushcomments` successfully posts the review to GitHub
5. A PR review triggered with `anthropic/claude-sonnet-4` still uses the existing `codereview` path (no regression)
6. Each file in the PR diff is reviewed independently (verifiable from comments.jsonl)
