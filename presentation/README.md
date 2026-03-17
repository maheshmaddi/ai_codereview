# Management Presentation — AI Code Review Platform

This folder contains all materials for the management presentation.

## Files

| File | Description |
|---|---|
| `slides.md` | All 13 presentation slides in Markdown format |
| `demo-script.md` | Step-by-step guide for the live demo (10–12 min) |
| `README.md` | This file — setup and export instructions |

---

## Presentation Overview

- **Total time:** ~30 minutes (20 min slides + 10 min demo)
- **Audience:** Management / Non-technical stakeholders
- **Goal:** Explain the business value of AI-powered code review and get pilot approval

---

## Exporting Slides

### Option A — Google Slides / PowerPoint

1. Copy the content from `slides.md`
2. Each `## Slide N —` heading becomes a new slide
3. Tables and bullet points can be pasted directly

### Option B — Marp (Markdown to slides)

Install [Marp CLI](https://github.com/marp-team/marp-cli) and run:

```bash
# Install
npm install -g @marp-team/marp-cli

# Export to HTML (for browser presentation)
marp slides.md --html -o slides.html

# Export to PDF
marp slides.md --pdf -o slides.pdf

# Export to PowerPoint
marp slides.md --pptx -o slides.pptx
```

### Option C — Reveal.js

Use the content in `slides.md` with a Reveal.js template. Each `---` divider becomes a new slide.

---

## Running the Live Demo

See `demo-script.md` for the full step-by-step guide.

### Quick Start Checklist

1. Start the application:
   ```bash
   # From the project root
   ./start.sh        # Linux/Mac
   .\start.ps1       # Windows
   ```

2. Verify both services are running:
   - Web dashboard: http://localhost:3000
   - API server: http://localhost:3001/api/projects

3. Prepare a demo pull request in your GitHub test repository with:
   - A hardcoded credential (Security finding)
   - A function without error handling (Bug finding)
   - A missing test (Testing finding)

4. Ensure the `ai_codereview` label exists in the repository

5. Open both browser tabs before presenting:
   - Tab 1: The demo pull request on GitHub
   - Tab 2: Web dashboard at http://localhost:3000

---

## Presenter Tips

- **Slide 8 (Business Benefits)** is the most important slide for management — spend extra time here
- The demo should be rehearsed at least once with real data before the meeting
- If short on time: cut Slides 10–11 and go straight from Slide 9 to the demo
- Keep technical terms to a minimum — use the plain-language alternatives in the slides
- The closing line from the demo script is key: *"30 seconds vs. 2–4 hours, every PR, every time"*
