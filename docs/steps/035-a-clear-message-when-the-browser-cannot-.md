---
id: 035
title: A clear message when the browser cannot draw the map
type: build
kind: fix
priority: P2
size: XS
needs: -
status: open
---
<!-- Change tags with: scripts/steps.sh tag NNN size=M priority=P1 needs=S002 (keeps ROADMAP.md in sync).
     kind: feature|fix|refactor|chore|research · priority: P1|P2|P3 · size: XS|S|M|L · needs: S002,S003 or -
     status: open | doing | waiting (results sent, waiting for yes) | done -->

## Goal
A browser that cannot draw the map (no WebGL 2: switched off, an old device, some locked-down or
privacy setups) gets a short message in German or English instead of an empty page with blank chips.

## Build steps only — acceptance criteria
- [ ] Without WebGL 2 the start card says that this browser cannot draw the map and what to try
      (another browser, hardware acceleration on); the rest of the app does not start
- [ ] Tests cover the new behaviour (the check and the message in both languages)
- [ ] The first map and taps are unchanged with WebGL (timings at 360×740 in the PR)

## Notes
- Found in S021: headless Firefox on GitHub's runners has no WebGL; MapLibre then throws while
  main.ts starts, boot.ts reloads once and the page stays empty with blank chips.
