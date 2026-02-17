# OpenCode Code Review — git-codereview

AI-powered, centralized code review platform integrating with GitHub pull requests via OpenCode.

## Overview

This system provides three OpenCode custom commands and a web-based management UI:

| Component | Description |
|-----------|-------------|
| `/codereview-int-deep` | Deep initialization — scans the project, generates module-level and root-level review guidelines, produces `codereview_index.json` |
| `/codereview` | Executes a code review against a PR by diffing branches, loading relevant guidelines, and generating structured review output |
| `/pushcomments` | Posts the review summary and per-line comments to the GitHub PR via the GitHub API |
| Web UI | Next.js app with Azure AD SSO for architects to view, edit, and manage review documents |

## Quick Start

### 1. Initialize a project

```bash
# In your project directory with OpenCode
/codereview-int-deep
```

This generates:
- `~/.codereview-store/projects/{host}/{org}/{project}/{project}_codereview.md`
- `~/.codereview-store/projects/{host}/{org}/{project}/modules/*.md`
- `~/.codereview-store/projects/{host}/{org}/{project}/codereview_index.json`

### 2. Review a pull request

```bash
/codereview 142 org/project-name
```

### 3. Push review comments to GitHub

```bash
/pushcomments 142
```

## GitHub Actions Integration

Add the `ai_codereview` label to any PR to trigger automated review:

```yaml
# .github/workflows/opencode-codereview.yml is already configured
```

Required secrets in your GitHub repository:
- `ANTHROPIC_API_KEY` — Anthropic API key
- `GITHUB_TOKEN` — Auto-provided by GitHub Actions

## Web UI

Start the management portal:

```bash
docker compose up
```

Navigate to `http://localhost:3000` and sign in with your Azure AD account.

### Web UI Features

- **Dashboard** — All registered projects with status badges
- **Project Explorer** — Module tree with inline markdown editor (Monaco + live preview)
- **Review History** — Timeline of all PR reviews with verdicts and links
- **Settings** — Per-project configuration (model, excluded paths, post-clone scripts)

## Directory Structure

```
.
├── .opencode/
│   ├── opencode.json              # OpenCode main config
│   ├── commands/
│   │   ├── codereview-int-deep.md # Deep init command
│   │   ├── codereview.md          # Review execution command
│   │   └── pushcomments.md        # GitHub posting command
│   ├── agents/
│   │   ├── codereview-analyzer.md # Analyzes project structure
│   │   ├── codereview-executor.md # Executes PR review
│   │   └── codereview-publisher.md# Posts to GitHub
│   └── rules/
│       └── codereview-rules.md    # Global review standards
├── .github/
│   └── workflows/
│       └── opencode-codereview.yml
├── web/                           # Next.js 14 Web UI
│   └── src/
│       ├── app/                   # App Router pages
│       ├── components/            # UI components
│       └── lib/                   # Utilities & API client
├── server/                        # Express API server
│   └── src/
│       ├── routes/                # API route handlers
│       ├── db/                    # SQLite database
│       └── lib/                   # Store & OpenCode client
├── config/
│   └── project-settings.example.json
└── docker-compose.yml
```

## Centralized Review Store

All review data is stored in `~/.codereview-store/`:

```
~/.codereview-store/
  projects/
    github.com/
      org/
        project/
          project_codereview.md      # Root review guidelines
          modules/
            auth_codereview.md
            api_codereview.md
          codereview_index.json
          settings.json
  reviews/
    2026-02-17_PR-142_project/
      review_summary.md
      review_comments.json
      push_log.json
  codereview.db                      # SQLite database
```

## Configuration

Copy and fill in the environment files:

```bash
cp server/.env.example server/.env
cp web/.env.example web/.env.local
```

See `config/project-settings.example.json` for per-project settings reference.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| AI Commands | OpenCode custom commands + agents |
| Web UI | Next.js 14, TypeScript, Tailwind CSS, Monaco Editor |
| Authentication | Azure AD via NextAuth.js |
| Backend API | Express.js, TypeScript |
| Database | SQLite (better-sqlite3) |
| OpenCode Integration | @opencode-ai/sdk |
| GitHub Integration | Octokit REST API |
| Deployment | Docker Compose |
