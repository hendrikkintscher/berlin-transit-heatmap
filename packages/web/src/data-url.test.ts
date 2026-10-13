import { afterEach, describe, expect, it } from 'vitest';
import { dataUrl, setDataVersions } from './data-url';

const base = 'https://x.test/app/data/berlin/';

describe('dataUrl', () => {
  afterEach(() => setDataVersions(null));

  it('adds the version of the file or of all timetables', () => {
    setDataVersions('{"walk":"1a2b3c4d","timetable":"99887766"}');
    expect(dataUrl(base, 'walk.bin').href).toBe(`${base}walk.bin?v=1a2b3c4d`);
    expect(dataUrl(base, 'timetable-weekday-17.bin').href).toBe(
      `${base}timetable-weekday-17.bin?v=99887766`,
    );
    expect(dataUrl(base, 'lines.bin').href).toBe(`${base}lines.bin`);
  });

  it('falls back to plain names without readable versions', () => {
    setDataVersions('not json');
    expect(dataUrl(base, 'walk.bin').href).toBe(`${base}walk.bin`);
  });
});
