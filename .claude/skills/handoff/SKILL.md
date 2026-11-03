---
name: handoff
description: Write docs/handoff.md so the next session can continue the current step, then suggest /clear. Use when a session is getting long or the user is stopping for the day.
disable-model-invocation: true
---

OVERWRITE `docs/handoff.md` (never append) with at most ~25 lines:

- **Step:** S0NN — title (this thread's step; the next session continues it, nothing else)
- **State:** done / half-done (file paths, branch) / verified; waiting for the user's yes?
- **Next action:** the very next concrete thing to do
- **Open questions / blockers**
- **Don't redo:** dead ends already tried, one line each

Before writing: update the step file (status, ticked criteria, results table) and record any
agreed decision as a decision record (see /step done) — the handoff is temporary, those are permanent.
Then tell the user: run `/clear`; the next session is pointed at the handoff automatically.
Once the next session has picked the work up, empty the file.
