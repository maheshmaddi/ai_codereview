---
description: Generate test cases plan based on requirements, architecture, and code changes
agent: codereview-analyzer
subtask: false
---

You are generating a comprehensive test plan for a feature.

## Input

The caller provides a JSON argument with:
- `featureId`: unique feature identifier
- `featureName`: human-readable feature name
- `architecturePlan`: markdown content of the approved architecture plan
- `changeSummary`: markdown summary of code changes made

## Task

Generate a test plan document that covers:

### Test Strategy
- Testing approach (unit, integration, e2e)
- Coverage targets
- Test environment setup

### Test Cases
For each test case, include:
- **Name**: Descriptive test case name
- **Priority**: Critical / High / Medium / Low
- **Type**: Unit / Integration / E2E / Performance
- **Description**: What is being tested
- **Steps**: Numbered steps to execute
- **Expected Result**: What should happen

### Categories to Cover
1. **API Endpoint Tests** — Test each new endpoint (happy path + error cases)
2. **Service Layer Tests** — Test business logic
3. **Validation Tests** — Test input validation and error handling
4. **Authentication Tests** — Test auth requirements
5. **Integration Tests** — Test interaction with existing modules
6. **Edge Cases** — Boundary conditions, null handling, concurrent access
7. **Performance Tests** — Load and response time requirements

### Priority Guidelines
- Critical: Core functionality that blocks release
- High: Important functionality with workarounds
- Medium: Edge cases and less common scenarios
- Low: Nice-to-have coverage improvements

## Output

Write `test_plan.md` in the current directory with the complete test plan in markdown format.

Structure each test case as:

```markdown
## Test Case {N}: {Name}
**Priority**: {Priority}
**Type**: {Type}
**Description**: {Description}
**Steps**:
1. {step 1}
2. {step 2}
**Expected**: {Expected result}
```

**All output files are created in the current working directory.**
**DO NOT modify any files in the project repository.**
