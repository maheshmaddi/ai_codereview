# Demo Script — AI Code Review Platform

> **Duration:** 10–12 minutes
> **Run after:** Slide 12 (Demo transition slide)
> **Audience:** Management / Non-technical stakeholders
> **Presenter note:** Rehearse this at least once end-to-end before the meeting. Have all browser tabs pre-opened.

---

## Before You Start — Pre-Demo Checklist

Complete these steps **before the presentation begins**:

- [ ] Local environment is running: API server (port 3001) + Web UI (port 3000)
- [ ] GitHub test repository is accessible and logged in
- [ ] A sample pull request is ready with deliberate issues (see below)
- [ ] The `ai_codereview` label exists in the GitHub repository
- [ ] The project is registered in the dashboard
- [ ] Two browser tabs pre-opened:
  - Tab 1: GitHub pull request page
  - Tab 2: Web dashboard (http://localhost:3000)
- [ ] Screen sharing / projector tested

### Sample Pull Request Content (for demo)

Use a PR that includes at least:
- A hardcoded password or API key (triggers **SECURITY - HIGH**)
- A function without error handling (triggers **BUG - MEDIUM**)
- A missing test for a new function (triggers **TESTING - LOW**)

This ensures the demo shows a meaningful, varied review output.

---

## Demo Flow

---

### Part 1 — The Pull Request (2 minutes)

**[Switch to Tab 1 — GitHub PR page]**

**Say:**
> "Here's what a developer sees. They've written some new code and opened a pull request — this is a request to merge their changes into the main codebase."

**Show:**
- The PR title and description
- The "Files changed" tab — scroll briefly to show the code diff
- Point to a few lines of code (don't explain the code in detail)

**Say:**
> "Normally, a developer would now wait for a colleague — often a senior engineer — to review this. That could take hours or even days. Instead, watch what happens when we add a label."

**Action:** Add the `ai_codereview` label to the PR (click Labels → select `ai_codereview`)

**Say:**
> "That's the trigger. The AI will now review this code automatically. Let's switch to the dashboard to watch it happen."

---

### Part 2 — Watch the Review in Progress (2 minutes)

**[Switch to Tab 2 — Web Dashboard]**

**Say:**
> "This is the management dashboard. You can see all our projects here. Let's look at the one we just triggered."

**Show:**
- Click into the project
- Navigate to the review history or active session view
- Show the review processing / in-progress status

**Say:**
> "The AI is now reading the code changes and checking them against our team's documented standards for this project. It knows what we care about — security, performance, code quality — because we set that up once during initialization."

*[Wait 20–30 seconds if the review is still running, or proceed if it's already complete]*

---

### Part 3 — The Review Results on GitHub (3 minutes)

**[Switch back to Tab 1 — GitHub PR page]**

**Say:**
> "Let's go back to GitHub — the review is done."

**Refresh the PR page**

**Show the overall review summary:**

**Say:**
> "The AI has posted a summary at the top — this is the verdict. In this case it's requesting changes because it found some issues. Let me show you what it found."

**Scroll through the inline comments:**

**Show a HIGH severity comment (Security):**
> "Here's a critical issue — a hardcoded password. The AI has flagged this as a security risk and explained exactly why it's a problem. In a manual review, this might be missed if the reviewer is busy or just skimming."

**Show a MEDIUM severity comment (Bug or Performance):**
> "Here's another issue — a warning-level finding. The AI explains what could go wrong and suggests how to fix it."

**Show a LOW severity comment (Testing or Documentation):**
> "And here's an informational suggestion — not blocking, just advice. The developer can choose to address it or not."

**Say:**
> "Every single one of these comments was generated automatically, in under a minute, with line numbers and explanations. The developer now has clear, actionable feedback — without waiting for anyone's calendar to open up."

---

### Part 4 — The Management Dashboard (3 minutes)

**[Switch back to Tab 2 — Web Dashboard]**

**Show the Project Detail Page:**

**Say:**
> "Back in the dashboard, let's look at what managers and team leads have access to."

**Show the Review History page:**
> "This is the full history of every pull request we've reviewed. Date, which developer, what was in the PR, and what the verdict was. This gives us a complete audit trail."

**Show the Document Editor:**
> "This is where team leads can update the review standards — written in plain text, no coding required. If we decide to add a new rule — for example, 'all API calls must have a timeout' — a team lead can add it here, and every future review will check for it."

**Show the Dashboard Overview:**
> "And the overview page shows us at a glance — how many projects are active, how many reviews have run, and overall health. It's designed so that even non-engineers can understand what's happening with code quality across the team."

---

### Part 5 — Closing Statement (1 minute)

**[Back to presentation slides — Slide 13: Next Steps]**

**Say:**
> "What we just saw took about 30 seconds from the moment we added that label to GitHub. A human reviewer doing the same job would typically take 2 to 4 hours — and that's assuming they're not in a meeting or working on something else."
>
> "More importantly: every PR gets this treatment. There's no backlog, no reviewer fatigue, no inconsistency. And everything is logged for compliance."
>
> "We think the right next step is a 30-day pilot on one team. Low risk, and we'll have real data on impact by the end of it."

---

## Handling Common Questions During or After the Demo

**Q: What if the AI gets something wrong?**
> "The AI provides recommendations — the developer still makes the final decision. And team leads can update the standards at any time to correct or improve the guidance."

**Q: Does our code get sent to a third party?**
> "The AI processes the code, but we control where the review data is stored — on our own infrastructure. Code is sent to the AI model only for analysis, the same way email is processed by a mail server."

**Q: What about our company's specific standards?**
> "That's actually one of the key features. During setup, the AI learns your project's specific patterns and standards. Team leads can then edit and expand those standards in plain text from the dashboard."

**Q: What happens to the review if we disagree with it?**
> "Developers and team leads can dismiss or override any review finding. The system supports and augments human decision-making — it doesn't replace it."

**Q: How long does it take to set up?**
> "Initial setup takes a few hours. Connecting to GitHub, registering the project, and running the first deep analysis. After that, every new PR is reviewed automatically."

---

## Backup Plan (If Live Demo Fails)

If the local environment is unavailable during the demo:
1. Use pre-recorded screenshots saved in `presentation/screenshots/`
2. Walk through GitHub screenshots first, then dashboard screenshots
3. Say: *"I'll show you the live system after the meeting, but here's what the output looks like..."*

---

## Technical Setup Reminder

To start the system before the demo:

```
# Start everything (Linux/Mac)
./start.sh

# Web dashboard
http://localhost:3000

# API server
http://localhost:3001
```

Ensure `GITHUB_TOKEN` is set in `server/.env` with access to the demo repository.
