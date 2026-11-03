---
name: spec
description: Interview the user and write a feature spec to docs/specs/, then propose it as roadmap steps. Use when a step is too big or vague to build directly.
argument-hint: '<feature>'
disable-model-invocation: true
---

Feature: $ARGUMENTS

1. Interview the user with short multiple-choice questions about what isn't decided yet:
   behaviour, edge cases, what's explicitly out of scope, how we'll know it works.
   Anything that needs measuring before it can be decided becomes a decision step, not a guess.
2. Write `docs/specs/<feature-slug>.md` (≤ ~80 lines): Goal, User-visible behaviour,
   Edge cases, Out of scope, How to verify.
3. Propose the steps (decision steps first, then build steps — each small enough for one PR).
   After the user's yes, add them with `/step new` (with tags; `needs` for the order between them),
   with acceptance criteria pointing back to the spec.
4. Don't start any of them. Name the first one and ask.
