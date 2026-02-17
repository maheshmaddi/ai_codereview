# Code Review Rules & Standards

These rules apply globally to all code review commands and agents in this project.

## General Principles

1. **Be constructive**: Every comment should explain the problem and suggest a fix.
2. **Be specific**: Reference exact line numbers and file paths.
3. **Be prioritized**: Severity levels (HIGH/MEDIUM/LOW) must be accurate.
4. **Be actionable**: Reviewers and authors should know exactly what change is needed.
5. **Never block unnecessarily**: LOW severity issues are informational, not blockers.

## Severity Definitions

| Severity | Definition | Block merge? |
|----------|-----------|--------------|
| HIGH | Security vulnerability, data loss risk, or functional bug | Yes |
| MEDIUM | Performance regression, code quality issue likely to cause bugs | Yes |
| LOW | Style, documentation, or minor optimization opportunity | No |

## Category Definitions

| Category | Examples |
|----------|----------|
| SECURITY | SQL injection, XSS, auth bypass, hardcoded secrets, insecure deserialization |
| PERFORMANCE | N+1 queries, missing indexes, blocking async ops, memory leaks |
| BUG | Logic errors, null reference risks, off-by-one errors, race conditions |
| CODE_QUALITY | God classes, duplicated logic, violation of SOLID/DRY, unclear naming |
| TESTING | Missing unit tests, missing edge case tests, flaky test patterns |
| DOCUMENTATION | Undocumented public API, missing JSDoc/docstring, confusing variable names |

## What NOT to Review

- Formatting issues handled by automated linters (leave to CI)
- Personal preference debates without a clear standard violation
- Changes to generated files (mark clearly if reviewing generated code)
- Third-party vendor files

## Review Store Rules

- Never write to the project repository from review commands
- All output goes to `~/.codereview-store/`
- Review files are immutable once posted to GitHub (create new review for follow-up)
- Index files must be regenerated when project structure changes significantly

## GitHub API Rules

- Use `GITHUB_TOKEN` from environment — never from config files
- Respect GitHub API rate limits (check `X-RateLimit-Remaining` header)
- All PR comments must be posted as a single batch review (not individual comments)
- Include the review URL in all output for traceability
