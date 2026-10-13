import { describe, expect, it } from 'vitest';
import { dataVersions, versionKey, withVersions } from './data-versions.mjs';

describe('data versions', () => {
  it('groups the timetables and keys the rest by name', () => {
    expect(versionKey('timetable-weekday-17.bin')).toBe('timetable');
    expect(versionKey('stop-ids.json')).toBe('stop-ids');
    const v = dataVersions([
      ['walk.bin', 'a'],
      ['timetable-weekday-17.bin', 'b'],
      ['timetable-20261013-08.bin', 'c'],
    ]);
    expect(Object.keys(v).sort()).toEqual(['timetable', 'walk']);
    expect(v.walk).toMatch(/^[0-9a-f]{8}$/);
    // Any timetable changing changes the shared version; the order files come in does not.
    const other = dataVersions([
      ['timetable-20261013-08.bin', 'c'],
      ['timetable-weekday-17.bin', 'B'],
      ['walk.bin', 'a'],
    ]);
    expect(other.walk).toBe(v.walk);
    expect(other.timetable).not.toBe(v.timetable);
  });

  it('writes the meta tag once', () => {
    const page = '<head>\n    <meta charset="UTF-8" />\n    <script>boot</script>\n  </head>';
    const once = withVersions(page, { walk: '12345678' });
    // Ahead of the start page's script, which reads it.
    expect(once).toContain(
      `<meta charset="UTF-8" />\n    <meta name="data-v" content='{"walk":"12345678"}' />\n    <script>`,
    );
    expect(withVersions(once, { walk: 'abcdef00' }).match(/data-v/g)).toHaveLength(1);
  });
});
