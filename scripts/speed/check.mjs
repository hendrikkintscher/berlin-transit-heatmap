// Speed budget (roadmap B1): fails when a change makes the app slower to load or compute.
//
//   node scripts/speed/check.mjs --dist packages/web/dist --data <dir> [--base <main checkout>]
//
// - Bundle: every JS and CSS file of the built app, gzipped, against scripts/speed/budget.json.
//   A file over its budget, or a new file without one, fails; raising a budget is a
//   deliberate edit to budget.json in the same pull request.
// - Routing: bench/speed.ts times the worker's map computation and timetable loading on
//   the real data (<dir> holds timetable-weekday-10.bin and walk.bin). With --base, the
//   same probe runs main's routing code in turns with this one on the same machine, and
//   this one may not be slower than the tolerance, nor write a bigger timetable file.
//   It also times drawing the maps (colours and outlines, from packages/web/src) and
//   snapping the grid cells to the footpaths.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { values: args } = parseArgs({
  options: {
    dist: { type: 'string', default: 'packages/web/dist' },
    data: { type: 'string' },
    base: { type: 'string' },
    runs: { type: 'string', default: '3' },
    write: { type: 'boolean', default: false },
  },
});
const budgetFile = join(root, 'scripts/speed/budget.json');
const budget = JSON.parse(readFileSync(budgetFile, 'utf8'));
const lines = [];
const failures = [];
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;
const ms = (v) => `${v.toFixed(0)} ms`;
const pct = (a, b) => (b ? `${a >= b ? '+' : ''}${((100 * (a - b)) / b).toFixed(1)} %` : '');

// ---------- bundle ----------
const assets = join(resolve(args.dist), 'assets');
const sizes = {};
for (const f of readdirSync(assets).sort()) {
  const m = /^(.+)-[\w-]{8}\.(js|css)$/.exec(f);
  if (!m) continue;
  const key = `${m[1]}.${m[2]}`;
  sizes[key] = (sizes[key] ?? 0) + gzipSync(readFileSync(join(assets, f)), { level: 9 }).length;
}
if (args.write) {
  budget.bundle = sizes;
  writeFileSync(budgetFile, `${JSON.stringify(budget, null, 2)}\n`);
  console.log(`Wrote the bundle sizes to ${budgetFile}`);
}
const slack = budget.bundleTolerance;
lines.push('### Bundle (gzipped)', '', '| File | Now | Budget | |', '| --- | --: | --: | --- |');
for (const [key, size] of Object.entries(sizes)) {
  const base = budget.bundle[key];
  const limit = base === undefined ? 0 : Math.round(base * (1 + slack.percent / 100) + slack.bytes);
  const ok = base !== undefined && size <= limit;
  if (!ok)
    failures.push(
      base === undefined
        ? `${key} (${kb(size)}) is new: give it a budget in scripts/speed/budget.json`
        : `${key} is ${kb(size)}, over its budget of ${kb(base)} (${pct(size, base)})`,
    );
  lines.push(
    `| ${key} | ${kb(size)} | ${base === undefined ? '–' : kb(base)} | ${ok ? '✅' : '❌'} ${pct(size, base)} |`,
  );
}

// ---------- routing ----------
if (args.data) {
  const probe = ({ routing, web }) => {
    const run = spawnSync(
      join(root, 'packages/routing/node_modules/.bin/tsx'),
      ['bench/speed.ts', routing, resolve(args.data), web],
      { cwd: join(root, 'packages/routing'), encoding: 'utf8' },
    );
    if (run.status !== 0) throw new Error(`Speed probe failed for ${routing}:\n${run.stderr}`);
    return JSON.parse(run.stdout.trim().split('\n').pop());
  };
  const sources = (dir) => ({
    routing: join(dir, 'packages/routing/src'),
    web: join(dir, 'packages/web/src'),
  });
  const sides = { pr: sources(root) };
  if (args.base) {
    const src = sources(resolve(args.base));
    if (existsSync(src.routing)) sides.main = src;
  }
  // Turns (main, this, main, this, …) so a busy moment on the machine hits both alike;
  // each side keeps its fastest run per measure.
  const best = {};
  for (let i = 0; i < Number(args.runs); i++)
    for (const [side, src] of Object.entries(sides)) {
      let r;
      try {
        r = probe(src);
      } catch (e) {
        if (side === 'pr') throw e;
        console.warn(`main's routing code cannot be timed with this probe, skipping: ${e}`);
        delete sides.main;
        continue;
      }
      const b = (best[side] ??= { loadMs: Infinity, origins: {}, draw: {}, binGzip: r.binGzip });
      b.loadMs = Math.min(b.loadMs, r.loadMs);
      // Older probes did not time these.
      if (r.snapMs !== undefined) b.snapMs = Math.min(b.snapMs ?? Infinity, r.snapMs);
      for (const [d, v] of Object.entries(r.draw ?? {}))
        b.draw[d] = Math.min(b.draw[d] ?? Infinity, v);
      for (const [o, v] of Object.entries(r.origins))
        b.origins[o] = Math.min(b.origins[o] ?? Infinity, v);
    }
  const total = (s) => Object.values(s.origins).reduce((a, v) => a + v, 0);
  const pr = best.pr;
  const main = best.main;
  const tol = budget.timingTolerance;
  lines.push(
    '',
    '### Routing (Node, fastest of the runs)',
    '',
    `| Measure | This change | main | |`,
    '| --- | --: | --: | --- |',
  );
  const row = (name, a, b, fmt, limit) => {
    const ok = b === undefined || a <= limit;
    if (!ok) failures.push(`${name}: ${fmt(a)}, main ${fmt(b)} (${pct(a, b)})`);
    lines.push(
      `| ${name} | ${fmt(a)} | ${b === undefined ? '–' : fmt(b)} | ${ok ? '✅' : '❌'} ${pct(a, b)} |`,
    );
  };
  for (const o of Object.keys(pr.origins)) {
    const b = main?.origins[o];
    row(
      `Map from ${o}`,
      pr.origins[o],
      b,
      ms,
      b === undefined ? 0 : b * (1 + tol.percent / 100) + tol.ms,
    );
  }
  const limit = (b) => (b === undefined ? 0 : b * (1 + tol.percent / 100) + tol.ms);
  const tb = main && total(main);
  row('All maps', total(pr), tb, ms, limit(tb));
  const DRAW = { colours: 'Colours, all maps', outlines: 'Outlines, all maps' };
  for (const [d, name] of Object.entries(DRAW))
    if (pr.draw[d] !== undefined) row(name, pr.draw[d], main?.draw[d], ms, limit(main?.draw[d]));
  row('Load timetable and footpaths', pr.loadMs, main?.loadMs, ms, limit(main?.loadMs));
  if (pr.snapMs !== undefined)
    row('of which snapping cells', pr.snapMs, main?.snapMs, ms, limit(main?.snapMs));
  // The file size is exact, so any growth beyond a few bytes counts.
  row('Timetable file (gzipped)', pr.binGzip, main?.binGzip, kb, main ? main.binGzip * 1.005 : 0);
  if (!main) lines.push('', '_No main checkout given: routing times are shown, not compared._');
}

const report = [
  failures.length ? '## ❌ Speed budget exceeded' : '## ✅ Speed budget kept',
  '',
  ...failures.map((f) => `- ${f}`),
  ...(failures.length ? [''] : []),
  ...lines,
].join('\n');
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
process.exit(failures.length ? 1 : 0);
