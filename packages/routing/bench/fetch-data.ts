import { ensureFile, ensureStopList, ensureTimetable } from './data';

for (const w of ['day', 'night'] as const) {
  const file = await ensureTimetable(w);
  console.log(file);
  const list = await ensureStopList(file);
  if (list) console.log(list);
}
console.log(await ensureFile('walk.bin'));
