import { describe, expect, it } from 'vitest';
import { linkQuery, readLink, type LinkState } from './url';

const NOW = { day: 'weekday', hour: 10 } as const;
const BASE: LinkState = {
  origin: null,
  others: [],
  to: null,
  when: NOW,
  direction: 'depart',
  measure: 'next',
  compare: null,
  walkKmh: 4,
  stepFree: false,
  travel: 'walk',
  routes: true,
  freq: false,
  desert: false,
  iso: true,
  heat: false,
};

describe('links', () => {
  it('leaves out everything that is the default', () => {
    expect(linkQuery(BASE, NOW)).toBe('');
    expect(readLink('', BASE)).toEqual(BASE);
  });

  it('round-trips every setting', () => {
    const full: LinkState = {
      origin: { lat: 52.5037, lon: 13.4108 },
      others: [
        { lat: 52.52, lon: 13.3694 },
        { lat: 52.48, lon: 13.43 },
      ],
      to: { lat: 52.43915, lon: 13.47215 },
      when: { day: 'weekend', hour: 2 },
      direction: 'arrive',
      measure: 'best',
      compare: { day: 'weekday', hour: 10 },
      walkKmh: 5,
      stepFree: true,
      travel: 'bike',
      routes: false,
      freq: true,
      desert: true,
      iso: false,
      heat: true,
    };
    const q = linkQuery(full, NOW, 'en');
    expect(q).toBe(
      'from=52.50370%2C13.41080&with=52.52000%2C13.36940&with=52.48000%2C13.43000&to=52.43915%2C13.47215&t=weekend-02' +
        '&dir=arr&m=best&cmp=weekday-10&walk=5&sf=1&go=bike&routes=0&layers=heat%2Cfreq%2Cdesert%2Cnoiso&lang=en',
    );
    expect(readLink(`?${q}`, BASE)).toEqual(full);
  });

  it('keeps the device settings a link does not name', () => {
    const device = { ...BASE, walkKmh: 6, stepFree: true, travel: 'bikeonly' as const };
    expect(readLink('?from=52.5,13.4', device)).toMatchObject({
      walkKmh: 6,
      stepFree: true,
      travel: 'bikeonly',
    });
    // …and a link that names them wins, also to turn one off.
    expect(readLink('?walk=3&sf=0&go=walk', device)).toMatchObject({
      walkKmh: 3,
      stepFree: false,
      travel: 'walk',
    });
  });

  it('ignores a second start or place without a start, and bad values', () => {
    expect(readLink('?with=52.5,13.4&to=52.5,13.4', BASE)).toMatchObject({
      origin: null,
      others: [],
      to: null,
    });
    expect(readLink('?from=x,13.4&walk=9&go=car&m=fast&t=weekday-30', BASE)).toEqual(BASE);
  });

  it('opens on Nächste, a meeting point on Typisch', () => {
    const meet = '?from=52.5,13.4&with=52.52,13.37';
    expect(readLink(meet, BASE).measure).toBe('typical');
    expect(readLink(`${meet}&m=next`, BASE).measure).toBe('next');
    expect(readLink('?from=52.5,13.4&m=typical', BASE).measure).toBe('typical');
    const two = { ...BASE, origin: { lat: 52.5, lon: 13.4 }, others: [{ lat: 52.52, lon: 13.37 }] };
    expect(linkQuery({ ...two, measure: 'typical' }, NOW)).not.toMatch(/(^|&)m=/);
    expect(linkQuery({ ...two, measure: 'next' }, NOW)).toContain('m=next');
    expect(linkQuery({ ...BASE, measure: 'typical' }, NOW)).toBe('m=typical');
  });

  it('keeps up to five starts', () => {
    const q = Array.from({ length: 6 }, (_, i) => `with=52.5${i},13.4`).join('&');
    expect(readLink(`?from=52.5,13.4&${q}`, BASE).others).toHaveLength(4);
  });

  it('reads the old night link', () => {
    expect(readLink('?w=night', BASE).when).toEqual({ day: 'weekday', hour: 2 });
  });
});
