// Speed budget (roadmap B1): fails when a change makes the app slower to load or compute.
//
//   node scripts/speed/check.mjs --dist packages/web/dist --data <dir> [--base <main checkout>]
//
// - Bundle: every JS and CSS file of the built app and its start page, gzipped, against
//   scripts/speed/budget.json.
//   A file over its budget, or a new file without one, fails; raising a budget is a
//   deliberate edit to budget.json in the same pull request.
// - Routing: bench/speed.ts times the worker's map computation and timetable loading on
//   the real data (<dir> holds timetable-weekday-10.bin, walk.bin and, for timetables built
//   since 0.13.13, stoplist.bin). With --base, the same probe runs main's routing code in
//   turns with this one on the same machine, and
//   this one may not be slower than the tolerance, nor write a bigger timetable file.
//   Each measure is the median of the runs (--runs, default 5).
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
    runs: { type: 'string', default: '5' },
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
// The start page too: its inline script (start-page.ts) runs before anything else loads.
sizes['index.html'] = gzipSync(readFileSync(join(resolve(args.dist), 'index.html')), {
  level: 9,
}).length;
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
  // Turns (main, this, main, this, …) so a busy moment on the machine hits both alike.
  // Each side reports the median of its runs per measure (0.13.16). On a GitHub runner, two
  // jobs on the same code differed (9 in 10 times) by up to ±10 % for a map and ±3.3 % for
  // all maps with the fastest of three runs; with the median of five and the probe's
  // warm-up pass, ±3.7 % and ±1.4 %.
  const runs = {};
  for (let i = 0; i < Number(args.runs); i++)
    for (const [side, src] of Object.entries(sides)) {
      let r;
      try {
        r = probe(src);
      } catch (e) {
        if (side === 'pr') throw e;
        console.warn(`main's routing code cannot be timed with this probe, skipping: ${e}`);
        delete sides.main;
        delete runs.main;
        continue;
      }
      (runs[side] ??= []).push(r);
    }
  const median = (vs) => {
    const s = vs.filter((v) => v !== undefined).sort((a, b) => a - b);
    if (!s.length) return undefined;
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const best = {};
  for (const [side, rs] of Object.entries(runs)) {
    const at = (f) => median(rs.map(f));
    const keys = (f) => [...new Set(rs.flatMap((r) => Object.keys(f(r) ?? {})))];
    const { binGzip, listGzip } = rs[0];
    best[side] = {
      binGzip,
      listGzip,
      loadMs: at((r) => r.loadMs),
      // Older probes did not time these.
      snapMs: at((r) => r.snapMs),
      origins: Object.fromEntries(keys((r) => r.origins).map((o) => [o, at((r) => r.origins[o])])),
      draw: Object.fromEntries(keys((r) => r.draw).map((d) => [d, at((r) => r.draw?.[d])])),
    };
  }
  const total = (s) => Object.values(s.origins).reduce((a, v) => a + v, 0);
  const pr = best.pr;
  const main = best.main;
  const tol = budget.timingTolerance;
  lines.push(
    '',
    `### Routing (Node, median of ${args.runs} runs)`,
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
  const limit = (b, t = tol) => (b === undefined ? 0 : b * (1 + t.percent / 100) + t.ms);
  // The maps themselves have tighter tolerances since their medians hold steady (0.13.16).
  const maps = budget.mapTolerance ?? { each: tol, all: tol };
  for (const o of Object.keys(pr.origins))
    row(`Map from ${o}`, pr.origins[o], main?.origins[o], ms, limit(main?.origins[o], maps.each));
  const tb = main && total(main);
  row('All maps', total(pr), tb, ms, limit(tb, maps.all));
  const DRAW = { colours: 'Colours, all maps', outlines: 'Outlines, all maps' };
  for (const [d, name] of Object.entries(DRAW))
    if (pr.draw[d] !== undefined) row(name, pr.draw[d], main?.draw[d], ms, limit(main?.draw[d]));
  row('Load timetable and footpaths', pr.loadMs, main?.loadMs, ms, limit(main?.loadMs));
  if (pr.snapMs !== undefined)
    row('of which snapping cells', pr.snapMs, main?.snapMs, ms, limit(main?.snapMs));
  // The file sizes are exact, so any growth beyond a few bytes counts: an hour's file, and
  // what a first visit downloads (that and the stop list, 0.13.13).
  row('Timetable file (gzipped)', pr.binGzip, main?.binGzip, kb, main ? main.binGzip * 1.005 : 0);
  const first = (s) => s.binGzip + (s.listGzip ?? 0);
  const fm = main && first(main);
  row('With the stop list (first visit)', first(pr), fm, kb, main ? fm * 1.005 : 0);
  if (!main) lines.push('', '_No main checkout given: routing times are shown, not compared._');
  else {
    const t = (x) => `${x.percent} % + ${x.ms} ms`;
    lines.push(
      '',
      `_Allowed over main: each map ${t(maps.each)}, all maps ${t(maps.all)}, the rest ${t(tol)}._`,
    );
  }
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
