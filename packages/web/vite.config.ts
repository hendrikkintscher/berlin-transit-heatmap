import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, defineConfig, type Plugin, type Rollup } from 'vite';
import { REGION } from '../routing/src/regions';

/** The map style main.ts loads (STYLE_URL), fetched from the start page already. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
/** The style's vector source (TileJSON), which MapLibre would only ask for once the style is in. */
const TILES_URL = 'https://tiles.openfreemap.org/planet';

/** A small script built on its own to be inlined in a page (src/start-page.ts, src/fresh.ts). */
async function inlineScript(file: string, define: Record<string, string>): Promise<string> {
  const out = (await build({
    configFile: false,
    logLevel: 'warn',
    define,
    build: {
      write: false,
      target: 'es2022',
      lib: {
        entry: fileURLToPath(new URL(`./src/${file}`, import.meta.url)),
        formats: ['iife'],
        name: 'inline',
      },
    },
  })) as Rollup.RollupOutput[];
  const code = out[0]!.output[0].code.trim();
  // Inline in a <script>: nothing in it may end the element.
  if (code.includes('</script')) throw new Error(`${file}: "</script" in the inline script`);
  return code;
}

/** The start page's inline script (src/start-page.ts), built for the worker's file. */
const startPage = (workerUrl: string) =>
  inlineScript('start-page.ts', { __WORKER_URL__: JSON.stringify(workerUrl) });

/**
 * The fresh-start page (fresh/, roadmap 0.13.7) with its script inline: an entry of its own
 * would split Vite's preload helper out of the app's entry, one more request on the start page.
 */
function freshPage(): Plugin {
  return {
    name: 'fresh-page',
    transformIndexHtml: {
      order: 'post',
      async handler(html, ctx) {
        if (ctx.path !== '/fresh/index.html') return html;
        const tag = '<!-- fresh.ts -->';
        if (!html.includes(tag)) throw new Error('fresh-page: no script placeholder');
        const code = await inlineScript('fresh.ts', { __REGION_ID__: JSON.stringify(REGION.id) });
        return html.replace(tag, () => `<script>${code}</script>`);
      },
    },
  };
}

/**
 * A faster first load (roadmap B4): the start page itself starts the routing worker, which
 * draws the first map at once, and asks for that map's timetable (start-page.ts, 'boot' in
 * worker.ts); it preloads the app's main code and the map style, and connects to the tile
 * server, all while the entry script is still loading. boot.ts takes the worker over.
 */
function earlyStart(): Plugin {
  return {
    name: 'early-start',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      async handler(html, ctx) {
        // Only the app's start page; the fresh-start page (fresh/) stays plain.
        if (ctx.path !== '/index.html') return html;
        const files = Object.keys(ctx.bundle ?? {});
        const worker = files.find((f) => /^assets\/worker-[\w-]+\.js$/.test(f));
        const main = files.find((f) => /^assets\/main-[\w-]+\.js$/.test(f));
        if (!worker || !main) throw new Error('early-start: worker or main chunk not found');
        const early = [
          `<link rel="preconnect" href="${new URL(STYLE_URL).origin}" crossorigin>`,
          `<link rel="preload" href="${STYLE_URL}" as="fetch" crossorigin>`,
          `<link rel="preload" href="${TILES_URL}" as="fetch" crossorigin>`,
          `<link rel="modulepreload" href="./${main}">`,
          // Without module workers the entry starts the worker as before.
          `<script>${await startPage(`./${worker}`)}</script>`,
        ];
        // Right after the charset, ahead of the stylesheet: a script after it would wait for it.
        const charset = /<meta charset="UTF-8" \/>\n/;
        if (!charset.test(html)) throw new Error('early-start: no charset meta in index.html');
        return html.replace(charset, (m) => m + early.map((t) => `    ${t}\n`).join(''));
      },
    },
  };
}

/** The app's version (package.json) and short commit, baked in so the Mehr menu needs no request. */
const APP_VERSION = (
  JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;
function shortCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return (process.env.GITHUB_SHA ?? '').slice(0, 7);
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_COMMIT__: JSON.stringify(shortCommit()),
  },
  // Relative base so the same build works at https://<user>.github.io/berlin-transit-heatmap/ and locally.
  base: './',
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    // The app, and the fresh-start page (roadmap 0.13.7).
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        fresh: fileURLToPath(new URL('./fresh/index.html', import.meta.url)),
      },
    },
  },
  plugins: [earlyStart(), freshPage()],
});
