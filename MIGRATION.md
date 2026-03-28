# OpenClaw Migration Guide

This document describes the migration from OpenCode to OpenClaw for AI code review.

## What Changed

### Dependencies
- **Removed:** `@opencode-ai/sdk`
- **Added:** `axios` (for OpenClaw API communication)

### Files Modified
1. `server/src/lib/openclaw-client.ts` — **NEW** (replaces opencode-client.ts)
2. `server/src/lib/opencode-client.ts` — **DEPRECATED** (kept for reference)
3. `server/src/routes/sessions.ts` — Updated imports
4. `server/src/routes/settings.ts` — Updated imports
5. `server/src/routes/projects.ts` — Updated imports
6. `server/src/routes/webhook.ts` — Updated imports
7. `server/src/lib/github-poller.ts` — Updated imports
8. `server/package.json` — Updated dependencies

### Command Mapping

| OpenCode Command | OpenClaw Skill | Local File | Description |
|------------------|----------------|------------|-------------|
| `/codereview-int-deep` | `codereview-init` | `.opencode/commands/codereview-int-deep.md` | Initialize project review guidelines |
| `/codereview` | `codereview-pr` | `.opencode/commands/codereview.md` | Review a pull request |
| `/pushcomments` | `codereview-push` | `.opencode/commands/pushcomments.md` | Post review comments to GitHub |
| — | `architecture-analyze` | `.opencode/commands/architecture-analyze.md` | Analyze requirements and generate Q&A |
| — | `architecture-plan` | `.opencode/commands/architecture-plan.md` | Generate architecture plan with diagrams |
| — | `development-execute` | `.opencode/commands/development-execute.md` | Implement code changes from plan |
| — | `testing-plan` | `.opencode/commands/testing-plan.md` | Generate test cases plan |
| — | `testing-execute` | `.opencode/commands/testing-execute.md` | Write and push test code |

### Environment Variables

**Before (OpenCode):**
```env
OPENCODE_SERVER_URL=http://localhost:4096
```

**After (OpenClaw):**
```env
OPENCLAW_SERVER_URL=http://localhost:3000
```

## Installation

### 1. Install Dependencies

```bash
cd server
npm install
```

This will install `axios` and remove `@opencode-ai/sdk`.

### 2. Update Environment Variables

Update your `.env` file:

```bash
# OpenClaw server URL (default: http://localhost:3000)
OPENCLAW_SERVER_URL=http://localhost:3000
```

### 3. OpenClaw Skills

Skills are defined as local markdown files in `.opencode/commands/`. They are bundled with the repository — **no separate installation needed**.

Verify all skill files exist:
```bash
ls .opencode/commands/
# Expected files:
#   codereview-int-deep.md   (codereview-init)
#   codereview.md            (codereview-pr)
#   pushcomments.md          (codereview-push)
#   architecture-analyze.md  (architecture-analyze)
#   architecture-plan.md     (architecture-plan)
#   development-execute.md   (development-execute)
#   testing-plan.md          (testing-plan)
#   testing-execute.md       (testing-execute)
```

The `start.sh` / `start.ps1` scripts automatically verify these files are present on startup.

### 4. Start the Server

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## Usage

### Initialize Project

```bash
# Via API
POST /api/projects/:projectId/initialize

# Via OpenClaw (manual)
/codereview-init maheshmaddi/laundry-management-app
```

### Review PR

```bash
# Via API
POST /api/reviews
{
  "pr_number": 142,
  "project_id": "github.com/maheshmaddi/laundry-management-app"
}

# Via OpenClaw (manual)
/codereview-pr 142 maheshmaddi/laundry-management-app
```

### Push Comments

```bash
# Via API
POST /api/reviews/:reviewId/push

# Via OpenClaw (manual)
/codereview-push 142 maheshmaddi/laundry-management-app
```

## Model Configuration

OpenClaw supports multiple AI models:

- **GLM:** `zai/glm-5`, `zai/glm-4.7`, `zai/glm-4.7-flash`
- **Claude:** `anthropic/claude-3-opus`, `anthropic/claude-3-sonnet`
- **Codex:** `openai/codex`

Set your preferred model in the Web UI or via API:

```bash
PATCH /api/settings
{
  "review_model": "zai/glm-5"
}
```

## Migration Checklist

- [x] Replace `@opencode-ai/sdk` with `axios`
- [x] Create `openclaw-client.ts` to replace `opencode-client.ts`
- [x] Update all imports in route files
- [x] Update package.json dependencies
- [ ] Install OpenClaw skills (codereview-init, codereview-pr, codereview-push)
- [ ] Test PR review flow
- [ ] Update GitHub Actions workflow (rename opencode-codereview.yml → openclaw-codereview.yml)
- [ ] Update documentation

## Rollback Plan

If migration fails, rollback by:

1. Reverting git changes:
```bash
git checkout master
git branch -D feature/openclaw-migration
```

2. Reinstalling OpenCode SDK:
```bash
cd server
npm install @opencode-ai/sdk@^1.2.6
```

3. Restarting server with OpenCode

## Benefits of OpenClaw

- ✅ **Cost Savings:** Open-source vs subscription
- ✅ **Better Integration:** Part of existing OpenClaw setup
- ✅ **More Models:** GLM, Claude, Codex support
- ✅ **Full Control:** Customize everything
- ✅ **Local Processing:** Data stays on your infrastructure
- ✅ **Simpler Stack:** One less service to manage

## Support

For issues or questions:
- OpenClaw docs: https://docs.openclaw.ai
- GitHub: https://github.com/openclaw/openclaw
- Community: https://discord.com/invite/clawd

## Timeline

- **Week 1:** Code changes and testing
- **Week 2:** Parallel run with OpenCode
- **Week 3:** Production deployment

---

**Migration Date:** 2026-03-21
**Status:** ✅ Code changes complete, testing in progress
**Next Steps:** Install OpenClaw skills and test PR review flow
