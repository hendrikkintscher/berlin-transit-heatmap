# Best practices

How to write each language this repo uses, checked against the current references (October
2026). The repo's own rules come first: [CLAUDE.md](CLAUDE.md) and the working agreement in
[ROADMAP.md](ROADMAP.md) win over anything here, and **speed comes first** everywhere.

| Language                 | Where                                                              | Checked by                           |
| ------------------------ | ------------------------------------------------------------------ | ------------------------------------ |
| TypeScript               | `packages/*/src`, tests, benches, `vite.config.ts`                 | `tsc --noEmit`, ESLint, Vitest       |
| JavaScript (ES modules)  | `scripts/**/*.mjs`, `bin/*.js`, `public/sw.js`, `eslint.config.js` | ESLint (`// @ts-check` where useful) |
| Shell (POSIX `sh`, Bash) | `scripts/gtfs/fetch.sh`, `scripts/publish/download.sh`, hooks      | by hand (see ShellCheck below)       |
| YAML (GitHub Actions)    | `.github/workflows/*.yml`, `pnpm-workspace.yaml`                   | Prettier, GitHub                     |
| HTML and CSS             | `packages/web/index.html`, `fresh/index.html`, `src/style.css`     | Prettier, smoke test                 |
| JSON / Markdown          | `package.json`, `tsconfig*.json`, `budget.json`, docs              | Prettier                             |

## All languages

- Run `pnpm check` before every push; `npx prettier --write` on changed docs. Prettier settings
  (`.prettierrc`): single quotes, 100 columns, trailing commas. Don't argue with the formatter.
- Comments say _why_ and give numbers ("0.5–0.7 MB gzipped each: keep the 12 most recently
  used"), not what the next line does. Match the comment density of the file you are in.
- Names are plain English words, the same word for the same thing across packages (Ziel, rings,
  card, trip).
- Small diffs: one roadmap step per PR, no drive-by refactors.

## TypeScript

The repo is on TypeScript 5.9 with `strict`, `noUncheckedIndexedAccess` (off in `web`),
`verbatimModuleSyntax`, `isolatedModules` and `erasableSyntaxOnly`.

**Write code that only needs its types erased.** TypeScript 5.8 added `erasableSyntaxOnly`, and
Node runs `.ts` files by stripping types (unflagged since Node 22.18, stable in Node 24). So:

- No `enum`, no `namespace` with runtime code, no constructor parameter properties, no
  `import x = require()`. Use `as const` objects and union types:
  ```ts
  export const Mode = { Walk: 0, Bus: 1, Rail: 2 } as const;
  export type Mode = (typeof Mode)[keyof typeof Mode];
  ```
- Mark type-only imports: `import type { Trip } from './trip.ts'` (or `import { type Trip }`).
  `verbatimModuleSyntax` enforces it; Node and Vite/Oxc need it to strip correctly.
- In Node-run packages (`routing`, `timetable-build`) write the `.ts` extension in relative
  imports (`allowImportingTsExtensions`). tsconfig `paths` are ignored by Node; use package
  `imports` (`#name`) if an alias is ever needed.

**Types that pay for themselves.**

- Prefer `unknown` to `any`, and narrow it. `satisfies` checks a literal against a type
  without widening it.
- Model messages and states as discriminated unions (`FromWorker` has a `type`
  tag) and switch on the tag; `noFallthroughCasesInSwitch` is on. An exhaustive
  `default: m satisfies never;` catches a new message kind at compile time.
- With `noUncheckedIndexedAccess`, handle `undefined` once at the boundary instead of sprinkling
  `!`. In hot loops over typed arrays where the index is proven, a local `!` is fine; say why.
- `readonly` arrays and `Readonly<>` on data shared between modules (timetables, walk graphs).

**Hot paths (routing, worker, paint).** These run on a phone at 4× slowdown:

- Typed arrays (`Int32Array`, `Uint16Array`, …) and flat structs-of-arrays over arrays of
  objects. Allocate once, reuse between runs; no closures or array spreads inside inner loops.
- Keep functions monomorphic: same argument shapes, no optional fields that appear later.
- Measure, don't guess: the benches in `packages/routing/bench`, `scripts/speed/check.mjs`, and
  the phone-size browser timings described in CLAUDE.md.

**Coming up (upgrade decisions, not part of any step yet):**

- **TypeScript 7.0** (released 2026-07-08) is the Go-native compiler, about 10× faster `tsc`.
  Same language; new defaults (`strict`, `module: esnext`, `types: []`,
  `noUncheckedSideEffectImports`) and removed options (`baseUrl`, `moduleResolution: node10`,
  `target: es5`, `esModuleInterop: false`). Our configs already avoid the removed ones. 7.0 has
  no programmatic API, so typescript-eslint keeps using TypeScript 6 via the
  `@typescript/typescript6` alias until 7.1. Path: 5.9 → 6.0 clean (no `ignoreDeprecations`) →
  7.0.
- List globals explicitly in `types` (the `web` and `routing` configs already do).

## JavaScript (Node scripts, service worker, configs)

- ES modules only (`"type": "module"`, `.mjs`), `node:` prefixes for built-ins
  (`import { readFile } from 'node:fs/promises'`), top-level `await` instead of wrapper
  functions.
- Put `// @ts-check` at the top of plain JS files that are more than a few lines; JSDoc types
  then get checked by the editor for free (as `eslint.config.js` does).
- Prefer built-ins over dependencies: `fetch`, `node:test`-style asserts, `util.parseArgs` for
  CLI flags, `AbortSignal.timeout(ms)` for timeouts, `structuredClone`.
- Fail loudly: scripts exit non-zero on any error (an unhandled rejection already does);
  `process.exitCode = 1` when reporting several failures before exiting.
- Scripts with logic get a `*.test.mjs` next to them (as `scripts/publish/plan.test.mjs`).

**Service worker (`packages/web/public/sw.js`).**

- Always `event.waitUntil()` around async work in `install`/`activate`, and `respondWith()`
  synchronously in `fetch`.
- Version cache names and delete unknown ones in `activate` (as `VERSION` does); bump on any
  breaking change to cached formats.
- Bound every cache (the `MAX_TIMETABLES` / `MAX_TILES` pattern) and never cache opaque or error
  responses (`response.ok`).
- Navigation: network with a timeout and a cached fallback, so a slow network never blocks the
  first map.

## Browser and worker code

- **The main thread is for taps.** Long work goes to the worker; on the main thread break it up
  so no task runs past ~50 ms. `scheduler.yield()` keeps its place in the queue (Chrome/Edge
  129+, Firefox 142+, not Safari): use it with a `MessageChannel` or `setTimeout` fallback (the
  `worker-post.ts` tick pattern).
- **Move, don't copy, big buffers.** Pass `ArrayBuffer`s in `postMessage`'s transfer list
  (`postMessage(msg, [msg.times.buffer])`); a structured-clone copy of megabytes costs
  milliseconds on a phone. The sender's buffer is empty afterwards: don't read it again.
- Keep message types in one shared union (`ToWorker` / `FromWorker`) so both ends are checked.
- Batch DOM writes; read layout (`getBoundingClientRect`) before writing, never interleaved.
  Use `requestAnimationFrame` for visual updates and passive listeners for touch/scroll.
- MapLibre: update existing sources with `setData` / feature state rather than removing and
  re-adding layers; keep layer counts low.
- Fetch the data a view needs as early as possible (`<link rel="preload">`/`modulepreload`, or
  start the fetch in `boot.ts` before the map initialises).

## HTML and CSS

- Semantic elements first (`button` for anything tappable, `dialog`, `details`, `label` for
  inputs); every icon-only control gets an `aria-label`. Tap targets at least 44×44 CSS px.
- Mobile first: the target is 360×740. Use `env(safe-area-inset-*)`, `dvh` units for full-height
  panels, and `prefers-color-scheme` / `prefers-reduced-motion`.
- Custom properties for colours and spacing; logical properties (`margin-inline`,
  `inset-block-end`) where layout must survive German text being long.
- Animate only `transform` and `opacity`. `contain: content` on panels that update often.
- Keep the inline critical CSS small; no web fonts that block the first paint.

## Shell

Two dialects live here: `#!/bin/sh` scripts must be POSIX (`scripts/gtfs/fetch.sh`), `#!/usr/bin/env
bash` scripts may use Bash (`scripts/publish/download.sh`). Pick one and keep the shebang honest.

- Start with `set -eu` (POSIX) or `set -euo pipefail` (Bash; `pipefail` entered POSIX only in
  the 2024 edition and older `dash` builds lack it, so don't rely on it under `/bin/sh`).
- Quote every expansion: `"$dir/$file"`, `"$@"`. Use `$(…)`, not backticks; `printf`, not
  `echo -e`. `[ ]` in `sh`, `[[ ]]` only in Bash.
- Default and validate inputs at the top: `TAG="${GTFS_TAG:-gtfs-latest}"`,
  `: "${GITHUB_REPOSITORY:?must be set}"`.
- `curl -fsSL --retry 3` (fail on HTTP errors, quiet, follow redirects). Write to a temporary
  file and `mv` at the end so a failed download never leaves a half file.
- Keep a script short; when it grows logic, it becomes a `.mjs` with tests.
- Lint with [ShellCheck](https://www.shellcheck.net/) (`shellcheck scripts/**/*.sh`); it reads
  the shebang to choose the dialect. Disable a rule inline with a reason, not globally.

## GitHub Actions (YAML)

- **Least privilege.** Every workflow already has a top-level `permissions:` block: keep it
  read-only by default and grant writes per job (`contents: write` only where a release is
  published).
- **No untrusted input in `run:`.** Pass `${{ github.event.* }}`, `inputs.*` and branch names
  through `env:` and use `"$VAR"` in the script, so a crafted value cannot inject shell.
- **Pin actions.** We use major tags (`actions/checkout@v4`). GitHub recommends pinning to full
  commit SHAs (with the version in a comment, kept fresh by Dependabot), and since 2026-10-14
  _workflow lockfiles_ (`.github/workflows/actions.lock`, via `gh actions-lock`) are in public
  preview and pin transitive actions too. Worth a roadmap decision; first-party `actions/*` are
  the lowest risk.
- Avoid `pull_request_target` and checking out PR code in privileged `workflow_run` jobs; treat
  artifacts from other workflows as untrusted.
- `timeout-minutes` on every job, `concurrency` groups for anything that publishes (as
  `build-timetable.yml`), and comments with the reason for each number (budgets, crons).
- Cron times are UTC; say the Berlin time in a comment.
- Lint workflows with [actionlint](https://github.com/rhysd/actionlint) and audit them with
  [zizmor](https://docs.zizmor.sh/) before larger changes.

## Tests

- Vitest, files next to the code (`*.test.ts`, `*.test.mjs`). Test behaviour through the public
  function, with small hand-made timetables; the real data runs in benches and
  `test:slow` (`ROUTING_SLOW=1`).
- A bug fix comes with the test that fails without it.
- Never skip or loosen a test to get green; never raise a speed budget without the reason in the
  PR.

## Toolchain versions (October 2026)

What we pin vs. the latest release, for planning upgrades as roadmap steps (each one measured
for speed before and after):

| Tool              | Repo | Latest | Notes                                                                                                                                 |
| ----------------- | ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Node              | 22   | 24, 26 | 22 is in maintenance until 2027-04-30; 24 enters maintenance 2026-10-20; 26 becomes LTS 2026-10-28. Move `.nvmrc` and CI to 24 or 26. |
| TypeScript        | 5.9  | 7.0.2  | Native compiler, see above; go via 6.0.                                                                                               |
| ESLint            | 9.39 | 10.12  | Flat config only (we already are); `eslint:recommended` gained rules; config lookup starts at each file's directory.                  |
| typescript-eslint | 8.46 | 8.71   | Consider `projectService: true` for type-aware rules such as `no-floating-promises` (costs lint time).                                |
| Vite              | 6.3  | 8.3    | Rolldown replaces esbuild + Rollup; `esbuild` options become `oxc`; object `manualChunks` no longer supported. Check bundle budgets.  |
| Vitest            | 3.2  | 5.0    | 4.0 made browser mode stable and removed `workspace` (use `projects`).                                                                |
| MapLibre GL JS    | 5.6  | 6.14   | Major version: check the changelog and the first-map timing.                                                                          |
| Prettier          | 3.4+ | 3.9    | Minor; may reformat a few files.                                                                                                      |

## Sources

- TypeScript: [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7.0/),
  [TSConfig reference](https://www.typescriptlang.org/tsconfig/) (`erasableSyntaxOnly`,
  `verbatimModuleSyntax`)
- Node: [release schedule](https://github.com/nodejs/Release/blob/main/schedule.json),
  [running TypeScript natively](https://nodejs.org/api/typescript.html)
- ESLint: [ESLint 10 release (InfoQ)](https://infoq.com/news/2026/04/eslint-10-release),
  [typescript-eslint typed linting](https://typescript-eslint.io/getting-started/typed-linting/)
- Vite / Vitest: [Vite migration guide](https://vite.dev/guide/migration),
  [Announcing Vitest 4](https://voidzero.dev/posts/announcing-vitest-4)
- Browser: [web.dev: Optimize long tasks](https://web.dev/articles/optimize-long-tasks),
  [MDN: Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects),
  [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)
- GitHub Actions: [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use),
  [Workflow lockfiles in public preview (2026-10-14)](https://github.blog/changelog/2026-10-14-github-actions-workflow-lockfiles-in-public-preview/),
  [zizmor](https://docs.zizmor.sh/), [actionlint](https://github.com/rhysd/actionlint)
- Shell: [ShellCheck wiki](https://www.shellcheck.net/wiki/),
  [POSIX shell command language](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html)
