---
description: Implement code changes based on approved architecture plan
agent: codereview-analyzer
subtask: false
---

You are implementing code changes for a feature based on an approved architecture plan.

## Input

The caller provides a JSON argument with:
- `featureId`: unique feature identifier
- `featureName`: human-readable feature name
- `branchName`: git branch name to create
- `architecturePlan`: markdown content of the approved architecture plan

## Task

Execute the following steps in order:

### Step 1: Create Branch
```
!`git checkout -b {branchName}`
```

### Step 2: Analyze Codebase
Scan the existing project structure to understand:
- File organization patterns
- Existing code conventions
- Relevant existing files to modify

### Step 3: Implement Changes
Based on the architecture plan:
- Create new files as specified
- Modify existing files as needed
- Follow existing code conventions and patterns
- Include proper error handling
- Add appropriate type annotations

### Step 4: Build & Verify
```
!`npm run build`
```
If the build fails, fix errors iteratively until it succeeds.

### Step 5: Verify Against Plan
Check that all components from the architecture plan are implemented:
- All API endpoints created
- All data models defined
- All security measures in place
- All error handling implemented

### Step 6: Push
```
!`git add -A && git commit -m "feat: implement {featureName}" && git push -u origin {branchName}`
```

### Step 7: Generate Summary
Create `change_summary.md` in the current directory containing:
- List of new files created (with purpose)
- List of modified files (with what changed)
- Architecture compliance notes
- Build/test results
- Any deviations from the plan with justification

## Output
- Code changes committed and pushed to the feature branch
- `change_summary.md` in the current directory

## Important Notes
- Follow existing project coding conventions exactly
- Do not introduce new dependencies without justification
- Ensure backward compatibility
- Add appropriate comments for complex logic

**All output files are created in the current working directory.**
