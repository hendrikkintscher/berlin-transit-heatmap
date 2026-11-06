import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { csvLine, gtfsSeconds, replay } from '../bench/gtfs';
import { cellCentre } from '../bench/live';
import { distanceM } from '../src';

describe('the S040 GTFS replay', () => {
  it('reads quoted fields and times past midnight', () => {
    expect(csvLine('1,"de:1::2","Rüdersdorf, Brückenstr.",13:15:00')).toEqual([
      '1',
      'de:1::2',
      'Rüdersdorf, Brückenstr.',
      '13:15:00',
    ]);
    expect(gtfsSeconds('25:04:30')).toBe(90270);
  });

  // A feed with one line: bus 255 X → Y → Z on weekdays at 10:00, and at 24:20 (00:20 the
  // next morning on the evening's service).
  const dir = mkdtempSync(join(tmpdir(), 'gtfs-'));
  const w = (name: string, text: string) => writeFileSync(join(dir, name), text);
  w(
    'stops.txt',
    'stop_id,stop_name,stop_lat,stop_lon\nx,"X, Platz",52.5,13.4\ny,Y,52.51,13.4\nz,Z,52.52,13.4\n',
  );
  w('routes.txt', 'route_id,route_short_name\nr1,255\n');
  w('trips.txt', 'route_id,service_id,trip_id\nr1,wd,t1\nr1,wd,t2\n');
  w(
    'calendar.txt',
    'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nwd,1,1,1,1,1,0,0,20261101,20261130\n',
  );
  w('calendar_dates.txt', 'service_id,date,exception_type\n');
  w(
    'stop_times.txt',
    'trip_id,stop_id,stop_sequence,arrival_time,departure_time\n' +
      't1,x,0,10:00:00,10:00:00\nt1,y,1,10:05:00,10:05:30\nt1,z,2,10:10:00,10:10:00\n' +
      't2,x,0,24:20:00,24:20:00\nt2,z,1,24:30:00,24:30:00\n',
  );
  const ride = (dep: number, arr: number, date = '20261110', to = 'Z', line = '255') => ({
    line,
    date,
    from: { name: 'X, Platz', lat: 52.5, lon: 13.4 },
    to: { name: to, lat: to === 'Y' ? 52.51 : 52.52, lon: 13.4 },
    dep,
    arr,
  });

  it('finds rides to the second, within a minute, after midnight, or not at all', async () => {
    const H = 3600;
    expect(
      await replay(dir, [
        ride(10 * H, 10 * H + 600),
        ride(10 * H, 10 * H + 300 + 30, '20261110', 'Y'),
        ride(20 * 60, 30 * 60, '20261111'),
        ride(24 * H + 20 * 60, 24 * H + 30 * 60, '20261110'),
        ride(10 * H, 10 * H + 600, '20261114'),
        ride(10 * H, 10 * H + 600, '20261110', 'Z', '256'),
      ]),
    ).toEqual(['exact', 'minute', 'exact', 'exact', 'missing', 'missing']);
  });
});

describe('cellCentre', () => {
  it('is the middle of the 50 m cell around a place', () => {
    const p = { lat: 52.52011, lon: 13.40523 };
    const c = cellCentre(p);
    expect(distanceM(p.lat, p.lon, c.lat, c.lon)).toBeLessThan(36);
    expect(cellCentre(c)).toEqual(c);
  });
});
