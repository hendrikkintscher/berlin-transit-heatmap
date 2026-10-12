import { defineConfig, type Plugin } from 'vite';

/** The map style main.ts loads (STYLE_URL), fetched from the start page already. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

/**
 * A faster first load (roadmap B4): the start page itself starts the routing worker (which
 * fetches the first map's timetable at once, see 'boot' in worker.ts), preloads the app's
 * main code and the map style, and connects to the tile server, all while the entry script
 * is still loading. boot.ts takes the worker over.
 */
function earlyStart(): Plugin {
  return {
    name: 'early-start',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const files = Object.keys(ctx.bundle ?? {});
        const worker = files.find((f) => /^assets\/worker-[\w-]+\.js$/.test(f));
        const main = files.find((f) => /^assets\/main-[\w-]+\.js$/.test(f));
        if (!worker || !main) throw new Error('early-start: worker or main chunk not found');
        const early = [
          `<link rel="preconnect" href="${new URL(STYLE_URL).origin}" crossorigin>`,
          `<link rel="preload" href="${STYLE_URL}" as="fetch" crossorigin>`,
          `<link rel="modulepreload" href="./${main}">`,
          // Without module workers or storage the entry starts the worker as before.
          `<script>try{var q=[],s=null,g=null;try{s=localStorage.getItem('step-free');g=localStorage.getItem('travel')}catch(e){}var w=new Worker('./${worker}',{type:'module'});w.onmessage=function(e){q.push(e)};w.postMessage({type:'boot',baseURI:document.baseURI,search:location.search,stepFree:s,travel:g});window.__boot={worker:w,early:q}}catch(e){}</script>`,
        ];
        // Right after the charset, ahead of the stylesheet: a script after it would wait for it.
        const charset = /<meta charset="UTF-8" \/>\n/;
        if (!charset.test(html)) throw new Error('early-start: no charset meta in index.html');
        return html.replace(charset, (m) => m + early.map((t) => `    ${t}\n`).join(''));
      },
    },
  };
}

export default defineConfig({
  // Relative base so the same build works at https://<user>.github.io/berlin-transit-heatmap/ and locally.
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  plugins: [earlyStart()],
});
