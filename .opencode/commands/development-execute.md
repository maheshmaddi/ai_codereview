---
description: Implement code changes based on the approved architecture plan
agent: codereview-executor
subtask: false
---

You are an expert software engineer. Your task is to implement the code changes described in the approved architecture plan, compile/test the changes, fix any errors, and generate a change summary.

## Step 1: Read context

Read the development context:
```
!`cat development_context.json 2>/dev/null || echo "{}"`
```

Read the architecture plan:
```
!`cat architecture_plan.md 2>/dev/null || echo "No architecture plan found"`
```

Extract the `branch_name` and `project_id` from development_context.json.

## Step 2: Navigate to the project repository

The project repository should be in the parent directory or accessible from the store. Check:
```
!`cat feature_context.json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('project_id',''))" 2>/dev/null`
```

## Step 3: Create git branch

Navigate to the project directory and create the feature branch:
```
git checkout -b {branch_name}
```

If the branch already exists:
```
git checkout {branch_name}
```

## Step 4: Implement the changes

Based on the architecture plan, implement all required code changes:
- New files as specified in the implementation approach
- Modifications to existing files
- Database migrations if needed
- Configuration changes

Follow the project's existing code style and patterns.

## Step 5: Build and verify

Run the project's build/compile command (detect from package.json, Makefile, etc.):
```
!`npm run build 2>&1 || yarn build 2>&1 || make build 2>&1 || echo "No build command found"`
```

If there are compilation errors, fix them iteratively.

## Step 6: Verify against architecture

Review the implementation against the architecture plan:
- All specified components implemented?
- API contracts match the design?
- Data model changes complete?
- Security requirements addressed?

## Step 7: Push to branch

```
git add -A
git commit -m "feat: implement {feature_name} as per architecture plan"
git push origin {branch_name}
```

## Step 8: Generate change summary

Write a summary of all changes to `change_summary.md`:

```markdown
# Change Summary: {feature_name}

## Branch
`{branch_name}`

## Overview
Brief description of what was implemented.

## Files Changed

### New Files
- `path/to/new/file.ts` — Description of what this file does

### Modified Files
- `path/to/modified/file.ts` — What was changed and why

### Deleted Files (if any)
- `path/to/deleted/file.ts` — Why it was removed

## Database Changes
- New tables/columns added (if any)
- Migration scripts (if any)

## API Changes
- New endpoints added
- Modified endpoints

## Configuration Changes
- Environment variables added/changed
- Configuration file changes

## Testing Notes
- What was manually tested
- Known limitations or areas needing attention
```

## Step 9: Confirm completion

Output:
- List of files created/modified
- Branch name
- Confirmation that change_summary.md was written
