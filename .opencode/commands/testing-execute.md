---
description: Implement test code based on the approved test plan
agent: codereview-executor
subtask: false
---

You are an expert software engineer specializing in testing. Your task is to implement the test cases defined in the approved test plan.

## Step 1: Read context

Read the test plan:
```
!`cat test_plan.md 2>/dev/null || echo "No test plan found"`
```

Read the development context:
```
!`cat development_context.json 2>/dev/null || echo "{}"`
```

Read the change summary to understand what was implemented:
```
!`cat change_summary.md 2>/dev/null || echo "No change summary found"`
```

## Step 2: Detect testing framework

Identify the project's testing framework:
```
!`cat package.json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); deps={**d.get('dependencies',{}), **d.get('devDependencies',{})}; frameworks=['jest','vitest','mocha','jasmine']; found=[f for f in frameworks if f in deps]; print(','.join(found) or 'none')" 2>/dev/null`
```

## Step 3: Examine existing test structure

Look at existing tests for patterns:
```
!`find . -name "*.test.ts" -o -name "*.spec.ts" -o -name "*.test.js" | head -20`
```

Read one existing test for style reference:
```
!`head -50 $(find . -name "*.test.ts" | head -1) 2>/dev/null || echo "No existing tests found"`
```

## Step 4: Implement unit tests

For each unit test defined in the test plan, create the test file following the project's conventions.

If no testing framework is installed, set up Jest:
```
!`npm install --save-dev jest @types/jest ts-jest 2>&1 | tail -5`
```

## Step 5: Implement integration tests

Create integration tests for the new API endpoints, following patterns from the test plan.

## Step 6: Run tests

Execute the tests to verify they pass:
```
!`npm test 2>&1 | tail -30`
```

Fix any failing tests.

## Step 7: Push test files to branch

```
git add -A
git commit -m "test: add test suite for {feature_name} as per test plan"
git push origin {branch_name}
```

## Step 8: Confirm completion

Output:
- List of test files created
- Test results summary (passed/failed)
- Code coverage (if available)
- Branch updated confirmation
