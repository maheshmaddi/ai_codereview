# OpenClaw Code Review — AI Code Review Platform

AI-powered, centralized code review platform integrating with GitHub pull requests via **OpenClaw**.

> **Migration Notice:** This project has been migrated from OpenCode to OpenClaw for better integration, cost savings, and flexibility. See [MIGRATION.md](MIGRATION.md) for details.

## Overview

This system provides three OpenClaw skills and a web-based management UI:

| Component | Description |
|-----------|-------------|
| `codereview-init` | Deep initialization — scans the project, generates module-level and root-level review guidelines, produces `codereview_index.json` |
| `codereview-pr` | Executes a code review against a PR by diffing branches, loading relevant guidelines, and generating structured review output |
| `codereview-push` | Posts the review summary and per-line comments to the GitHub PR via the GitHub API |
| Web UI | Next.js app with Azure AD SSO for architects to view, edit, and manage review documents |

## Quick Start

### Prerequisites

- **Node.js 18+** — Required for the API server and web UI
- **OpenClaw** — Required for AI code review features (optional but recommended)
- **GitHub Personal Access Token** — For GitHub API access

### Option A: Without Docker (Recommended for local dev)

```powershell
# Windows
.\start.ps1

# Linux / Mac
chmod +x start.sh && ./start.sh
```

This single script will:
1. Check Node.js 18+ is installed
2. Check for OpenClaw installation
3. Create `.env` files from examples (if not present)
4. Install dependencies for server and web
5. Start OpenClaw server on `http://localhost:3000` (if installed)
6. Start the API server on `http://localhost:3001`
7. Start the Web UI on `http://localhost:3002`

### Option B: With Docker

```bash
docker compose up
```

### 1. Install OpenClaw Skills

The following OpenClaw skills are required:

```bash
# In OpenClaw
/skill-creator "codereview-init - Initialize project review guidelines"
/skill-creator "codereview-pr - Review a pull request"
/skill-creator "codereview-push - Post review comments to GitHub"
```

Or install from ClawHub (if available):
```bash
/clawhub install codereview-init
/clawhub install codereview-pr
/clawhub install codereview-push
```

### 2. Initialize a project

```bash
# Via OpenClaw
/codereview-init org/project-name
```

This generates:
- `~/.codereview-store/projects/{host}/{org}/{project}/{project}_codereview.md`
- `~/.codereview-store/projects/{host}/{org}/{project}/modules/*.md`
- `~/.codereview-store/projects/{host}/{org}/{project}/codereview_index.json`

### 3. Review a pull request

```bash
# Via OpenClaw
/codereview-pr 142 org/project-name
```

### 4. Push review comments to GitHub

```bash
# Via OpenClaw
/codereview-push 142 org/project-name
```

## GitHub Integration

### Option A: Polling Mode (No workflow access needed)

If you don't have GitHub Actions workflow access, use **polling mode** with a GitHub Personal Access Token:

1. Set your token in `server/.env`:
   ```env
   GITHUB_TOKEN=github_pat_your_token_here
   GITHUB_POLLING_ENABLED=true
   GITHUB_POLLING_INTERVAL_SECONDS=60
   ```

2. Enable polling per-project via the API or Web UI settings

3. The poller checks registered repos every 60s for PRs with the `ai_codereview` label

**Polling API endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/polling/status` | GET | Current poller state |
| `/api/polling/start` | POST | Start the poller |
| `/api/polling/stop` | POST | Stop the poller |
| `/api/polling/trigger` | POST | Trigger an immediate poll |

### Option B: GitHub Actions Workflow

Add the `ai_codereview` label to any PR to trigger automated review:

```yaml
# .github/workflows/opencode-codereview.yml is already configured
```

Required secrets in your GitHub repository:
- `GITHUB_TOKEN` — Auto-provided by GitHub Actions

### Option C: Webhooks

Configure a GitHub webhook pointing to `POST /webhooks/github` on your server.

## Web UI

Navigate to `http://localhost:3000` and sign in with your Azure AD account.

### Web UI Features

- **Dashboard** — All registered projects with status badges
- **Project Explorer** — Module tree with inline markdown editor (Monaco + live preview)
- **Review History** — Timeline of all PR reviews with verdicts and links
- **Settings** — Per-project configuration (model, excluded paths, polling toggle)

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
│       │   ├── projects.ts        # Project CRUD
│       │   ├── reviews.ts         # Review output
│       │   ├── sessions.ts        # OpenCode sessions
│       │   ├── webhook.ts         # GitHub webhook receiver
│       │   └── polling.ts         # Polling management API
│       ├── db/                    # SQLite database
│       └── lib/
│           ├── store.ts           # File store operations
│           ├── opencode-client.ts # OpenCode SDK client
│           └── github-poller.ts   # GitHub polling service
├── config/
│   └── project-settings.example.json
├── start.ps1                      # Windows startup script
├── start.sh                       # Linux/Mac startup script
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
| Database | SQLite (sqlite3) |
| GitHub Integration | Octokit REST API (polling + webhooks) |
| OpenCode Integration | @opencode-ai/sdk |
| Deployment | Docker Compose or native (start.ps1 / start.sh) |

