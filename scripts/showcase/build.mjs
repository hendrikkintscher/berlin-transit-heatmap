// Showcase pictures (S022): the app's screenshots as small WebP files and sharepics made from them.
//
//   LANG=de_DE.UTF-8 node scripts/layout/screens.mjs --out work/shots --sizes 390x844 --langs de
//   LANG=de_DE.UTF-8 node scripts/layout/screens.mjs --out work/pics --sizes 390x844 --langs de \
//     --screens map,reach,treffpunkt,living,places-wannsee --notip
//   node scripts/showcase/build.mjs --shots work/shots --pics work/pics --out showcase [--langs de]
//
// (LANG: headless Chromium writes the time field in its own locale, else "04:54 PM" in German.)
// Reads <shots>/<size>-<lang>-<screen>.png (as screens.mjs writes them, real basemap) and writes
// <out>/screens/<lang>-<screen>.webp (same pixels, about a tenth of the PNG) and
// <out>/sharepics/<lang>-<name>.jpg (1080×1080: a headline beside a phone with the screenshot).
// Both are drawn in Chromium, so nothing beyond Playwright is needed. The repo keeps the German
// pictures (about 1.5 MB); English ones are made the same way with --langs en.
/* global document, Image */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const playwright = require('playwright-core');

const { values: opt } = parseArgs({
  options: {
    shots: { type: 'string', default: 'work/shots' },
    // The sharepics' screenshots, taken with screens.mjs --notip (default: --shots).
    pics: { type: 'string', default: '' },
    out: { type: 'string', default: 'showcase' },
    langs: { type: 'string', default: 'de' },
    size: { type: 'string', default: '390x844' },
    // WebP quality of the screenshots, 0 to 1.
    quality: { type: 'string', default: '0.72' },
  },
});

/** The screens kept for the showcase, in screens.mjs's names. */
const SCREENS = [
  'first',
  'map',
  'trip',
  'drawer',
  'zeit',
  'search',
  'menu',
  'treffpunkt',
  'places',
  'places-zoom',
  'places-wannsee',
  'reach',
  'living',
];

/** Each sharepic: the screenshot it shows and its words per language. */
const PICS = {
  app: {
    shot: 'map',
    de: {
      title: 'Wie lange brauchst du mit Bus und Bahn überallhin?',
      sub: 'Tippe auf die Karte von Berlin und sieh die Minuten.',
    },
    en: {
      title: 'How long does it take to get anywhere by bus and train?',
      sub: 'Tap the map of Berlin and see the minutes.',
    },
  },
  // One picture per question of the start card (S023), and "Wohin jetzt?" for the places.
  reach: {
    shot: 'reach',
    de: {
      title: 'Was erreiche ich in 30 Min.?',
      sub: 'Was du in einer halben Stunde mit Bus und Bahn schaffst, bleibt klar. Der Rest wird blass.',
    },
    en: {
      title: 'What can I reach in 30 min?',
      sub: 'What you reach by bus and train in half an hour stays clear. The rest fades.',
    },
  },
  meet: {
    shot: 'treffpunkt',
    de: {
      title: 'Wo treffen wir uns?',
      sub: 'Zwei Startpunkte, eine Karte: Vorschläge, die für alle gleich gut liegen.',
    },
    en: {
      title: 'Where do we meet?',
      sub: 'Two starts, one map: suggestions that suit everyone alike.',
    },
  },
  living: {
    shot: 'living',
    de: {
      title: 'Wo soll ich wohnen?',
      sub: 'Arbeit, Freunde, Uni: die Karte zeigt, wo du im Schnitt am schnellsten überall bist.',
    },
    en: {
      title: 'Where should I live?',
      sub: 'Work, friends, uni: the map shows where you reach them all quickest on average.',
    },
  },
  places: {
    shot: 'places-wannsee',
    de: {
      title: 'Wohin jetzt?',
      sub: 'Seen, Badestellen, Parks und Wälder, jeweils mit den Minuten ab deinem Start.',
    },
    en: {
      title: 'Where to now?',
      sub: 'Lakes, bathing spots, parks and forests, each with the minutes from your start.',
    },
  },
};

const URL_TEXT = 'hendrikkintscher.github.io/<br>berlin-transit-heatmap';
const ICON = readFileSync('packages/web/public/icons/icon.svg', 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** The sharepic's page: words on the left, the phone on the right, on the app's purple. */
function sharepic(words, shot) {
  return `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1080px; height: 1080px; overflow: hidden; font-family: system-ui, sans-serif;
    background: radial-gradient(circle at 78% 55%, #5e1f8c 0, #2d0f5e 62%); color: #fff;
    display: flex; align-items: center; padding: 0 64px; gap: 52px; }
  .words { flex: 1; display: flex; flex-direction: column; height: 900px; }
  .brand { display: flex; align-items: center; gap: 18px; font-size: 34px; font-weight: 700; }
  .brand svg { width: 72px; height: 72px; }
  h1 { margin-top: auto; font-size: 62px; line-height: 1.12; font-weight: 800; letter-spacing: -0.5px; }
  p { margin-top: 28px; font-size: 32px; line-height: 1.3; color: #e6dcf2; }
  .url { margin-top: auto; font-size: 24px; line-height: 1.35; color: #cbbbe0; }
  .phone { width: 430px; height: 930px; flex: none; border-radius: 58px; padding: 14px;
    background: #120624; box-shadow: 0 30px 80px rgba(0,0,0,0.45); }
  .phone img { width: 100%; height: 100%; border-radius: 44px; object-fit: cover; display: block; }
  </style><div class="words"><div class="brand">${ICON}Wohin jetzt?</div>
  <h1>${esc(words.title)}</h1><p>${esc(words.sub)}</p><div class="url">${URL_TEXT}</div></div>
  <div class="phone"><img src="data:image/png;base64,${shot.toString('base64')}"></div>`;
}

const exe =
  process.env.CHROMIUM ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await playwright.chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
mkdirSync(join(opt.out, 'screens'), { recursive: true });
mkdirSync(join(opt.out, 'sharepics'), { recursive: true });
const png = (lang, screen, dir = opt.shots) => join(dir, `${opt.size}-${lang}-${screen}.png`);

for (const lang of opt.langs.split(',')) {
  for (const screen of SCREENS) {
    const file = png(lang, screen);
    if (!existsSync(file)) {
      console.log(`missing ${file}`);
      continue;
    }
    const b64 = readFileSync(file).toString('base64');
    const webp = await page.evaluate(
      async ([src, q]) => {
        const img = new Image();
        img.src = `data:image/png;base64,${src}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        return c.toDataURL('image/webp', q).split(',')[1];
      },
      [b64, Number(opt.quality)],
    );
    const out = join(opt.out, 'screens', `${lang}-${screen}.webp`);
    writeFileSync(out, Buffer.from(webp, 'base64'));
    console.log(out);
  }
  for (const [name, pic] of Object.entries(PICS)) {
    const file = png(lang, pic.shot, opt.pics || opt.shots);
    if (!existsSync(file) || !pic[lang]) continue;
    await page.setContent(sharepic(pic[lang], readFileSync(file)));
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    const out = join(opt.out, 'sharepics', `${lang}-${name}.jpg`);
    await page.screenshot({ path: out, type: 'jpeg', quality: 88 });
    console.log(out);
  }
}
await browser.close();
