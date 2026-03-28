---
description: Generate a comprehensive test plan based on requirements, architecture, and implemented changes
agent: codereview-analyzer
subtask: false
---

You are a senior QA engineer and test architect. Your task is to create a comprehensive test plan based on the requirements, architecture plan, and change summary.

## Step 1: Read all context

Read the requirement:
```
!`cat requirement_content.txt 2>/dev/null || echo "No requirement file found"`
```

Read the architecture plan:
```
!`cat architecture_plan.md 2>/dev/null || echo "No architecture plan found"`
```

Read the change summary:
```
!`cat change_summary.md 2>/dev/null || echo "No change summary found"`
```

Read the Q&A answers for business rules:
```
!`cat qa_answers.json 2>/dev/null || echo "[]"`
```

## Step 2: Generate the test plan

Write a detailed test plan to `test_plan.md`:

```markdown
# Test Plan: {feature_name}

## Overview
What this test plan covers and testing approach.

## Test Environment Requirements
- Required services/dependencies
- Test data requirements
- Environment variables needed

## Unit Tests

### {ComponentName} Tests
**File:** `path/to/component.test.ts`

#### Test Case 1: {Name}
- **Priority:** HIGH | MEDIUM | LOW
- **Description:** What is being tested
- **Steps:**
  1. Set up test data
  2. Call the function/method
  3. Assert result
- **Expected Result:** What the correct output should be
- **Edge Cases:** Boundary conditions to check

### {ServiceName} Tests
...

## Integration Tests

### API Endpoint Tests

#### POST /api/features/{id}/architecture/analyze
- **Test Case:** Valid requirement file upload and analysis
  - Steps: Upload valid PDF → trigger analyze → verify questions generated
  - Expected: 200 OK, questions array returned
- **Test Case:** Missing file
  - Expected: 400 error with clear message
- **Test Case:** File too large (>5MB)
  - Expected: 413 error

### Database Integration Tests
...

## End-to-End Tests

### Happy Path: Complete {Feature Name} Flow
1. Create feature → Upload requirement → Analyze → Answer questions → Generate plan → Approve → Start development → Approve → Generate tests → Approve

### Error Scenarios
- What happens if OpenClaw is unavailable?
- What happens if the requirement file is corrupted?

## Regression Tests
List of existing functionality that must continue to work:
- Project listing
- PR review flow
- Document editing

## Performance Tests (if applicable)
- File upload with maximum allowed size
- Concurrent users accessing phase pages

## Security Tests
- File upload type validation (attempt to upload .exe)
- File size limit enforcement
- Authentication required for all phase endpoints

## Test Coverage Targets
- Unit tests: >80% coverage for new code
- Integration tests: All API endpoints covered
- E2E tests: All main user flows covered
```

## Step 3: Confirm completion

Output:
- Total number of test cases defined
- Test categories covered
- Confirm `test_plan.md` was written
