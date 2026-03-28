---
description: Write and push test code based on approved test plan
agent: codereview-analyzer
subtask: false
---

You are implementing test code based on an approved test plan.

## Input

The caller provides a JSON argument with:
- `featureId`: unique feature identifier
- `featureName`: human-readable feature name
- `branchName`: git branch name to push to
- `testPlan`: markdown content of the approved test plan

## Task

### Step 1: Analyze Test Plan
Read the test plan and identify:
- All test cases to implement
- Required test fixtures and helpers
- Mock/stub requirements

### Step 2: Implement Tests
For each test case in the plan:
- Create appropriate test file(s) following project test conventions
- Implement test setup (beforeEach/afterEach)
- Write test cases with clear descriptions
- Add proper assertions
- Include error case tests

### Step 3: Follow Project Conventions
- Use the project's existing test framework (jest, vitest, mocha, etc.)
- Follow existing test file naming patterns
- Place tests in the appropriate directory structure
- Use existing test utilities and helpers

### Step 4: Verify Tests Run
```
!`npm test`
```
If tests fail, fix them until they pass.

### Step 5: Commit and Push
```
!`git add -A && git commit -m "test: add tests for {featureName}" && git push`
```

## Output
- Test files written to the appropriate directories
- All tests passing
- Changes committed and pushed to the feature branch

## Important Notes
- Each test should be independent and idempotent
- Use descriptive test names that explain the expected behavior
- Include both positive and negative test cases
- Mock external dependencies appropriately
- Ensure tests clean up after themselves

**All output files are created in the current working directory.**
