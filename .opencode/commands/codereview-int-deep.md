---
description: Deep initialization — generates code review docs for entire project
agent: codereview-analyzer
subtask: false
---

Analyze the complete project structure of this repository.

## Step 1: Discover project structure

Run the following to understand the repository layout:
```
!`find . -type f -not -path './.git/*' -not -path './node_modules/*' -not -path './dist/*' | head -200`
```

Identify:
- The project name (from package.json, pom.xml, go.mod, Cargo.toml, pyproject.toml, or directory name)
- The git remote URL: `!`git remote get-url origin``
- All top-level modules/packages (directories containing significant source code)
- The technology stack (language, frameworks, build tools)

## Step 2: Determine store path

Output files to the current working directory. The caller is responsible for moving them to the centralized store if needed.

Create directory structure in current directory:
```
./modules/
./
```

## Step 3: Generate root code review document

Create `{project-name}_codereview.md` in the current directory containing:

### Project Overview
- What the project does and its primary purpose
- Target users / consumers of this software

### Architecture & Technology Stack
- Languages, frameworks, and major libraries used
- Architectural patterns (MVC, microservices, event-driven, etc.)
- Build and dependency management tools

### Coding Standards & Conventions
- Naming conventions (files, classes, functions, variables)
- File and directory organization patterns
- Formatting standards (observed from existing code)
- Error handling conventions

### Code Review Checklist — General
- [ ] No hardcoded credentials, tokens, or sensitive data
- [ ] All public APIs are documented
- [ ] Error cases are handled and logged appropriately
- [ ] No dead code or commented-out blocks
- [ ] Changes are backward-compatible or breaking changes are documented

### Security Checklist
- [ ] Input validation at all entry points
- [ ] Parameterized queries (no SQL injection risk)
- [ ] Authentication and authorization checks in place
- [ ] Sensitive data is not logged
- [ ] Dependencies are up-to-date and free of known CVEs
- [ ] CORS and CSP headers configured correctly (if applicable)

### Performance Checklist
- [ ] Database queries are optimized (no N+1 patterns)
- [ ] Expensive operations are cached where appropriate
- [ ] Async/await used correctly (no blocking operations in async contexts)
- [ ] Memory-intensive operations are bounded

### Testing Requirements
- Minimum coverage threshold (infer from existing test configuration)
- Unit tests required for all business logic
- Integration tests required for API endpoints
- Test naming conventions to follow

### Dependency Management
- Package lock files must be committed
- No major version bumps without team sign-off
- Security advisories must be resolved before merge

## Step 4: Generate module-level review documents

For EACH module/package identified, create `modules/{module-name}_codereview.md` in the current directory containing:

### Module Purpose
- Responsibility and boundary of this module
- Key consumers and dependencies

### Key Components to Review
- List of critical files, classes, functions, or interfaces in this module
- What each is responsible for and what to look for in changes

### Module-Specific Patterns
- Patterns and conventions unique to this module
- Common anti-patterns to watch for
- Known technical debt or areas requiring extra care

### Module Checklist
- Module-specific review items beyond the root checklist

### Testing Requirements
- Test structure for this module
- Integration points that require mock/stub verification

## Step 5: Generate index file

Create `codereview_index.json` in the current directory:

```json
{
  "project": "{project-name}",
  "git_remote": "{git-remote-url}",
  "generated_at": "{ISO-8601-timestamp}",
  "root_codereview": "{project-name}_codereview.md",
  "modules": [
    {
      "name": "{module-name}",
      "path": "{relative-source-path}",
      "codereview_file": "modules/{module-name}_codereview.md"
    }
  ],
  "total_files": {count-of-all-generated-files}
}
```

## Step 6: Confirm completion

Output a summary confirming:
- The current directory where files were written
- The list of all generated files
- The total module count
- Any modules that were skipped and why

**All output files are created in the current working directory.**
**DO NOT modify any files in the project repository.**
