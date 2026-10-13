import { ensureFile, ensureTimetable } from './data';

for (const w of ['day', 'night'] as const) console.log(await ensureTimetable(w));
console.log(await ensureFile('walk.bin'));
