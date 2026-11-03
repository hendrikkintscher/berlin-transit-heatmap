import { describe, expect, it } from 'vitest';
import { STRINGS } from './i18n';
import { LIMIT_MINUTES } from './colors';
import { firstStep, questionOf, REACH_MINUTES } from './questions';

describe('question entries (S015)', () => {
  it('reads the buttons’ data-ask values', () => {
    expect(questionOf('meet')).toBe('meet');
    expect(questionOf('reach')).toBe('reach');
    expect(questionOf('living')).toBe('living');
    expect(questionOf('other')).toBeNull();
    expect(questionOf(undefined)).toBeNull();
  });

  it('searches what each question needs first', () => {
    expect(firstStep('meet', 0)).toEqual({ search: 'meet' });
    expect(firstStep('meet', 3)).toEqual({ search: 'meet' });
    expect(firstStep('reach', 0)).toEqual({ search: 'reach' });
  });

  it('shows the where-to-live map at once when there are favourite places', () => {
    expect(firstStep('living', 0)).toEqual({ search: 'living' });
    expect(firstStep('living', 1)).toEqual({ show: 'living' });
  });

  it('sets minutes the menu offers, and says them in both languages', () => {
    expect(LIMIT_MINUTES).toContain(REACH_MINUTES);
    expect(STRINGS.de.askReach).toContain(String(REACH_MINUTES));
    expect(STRINGS.en.askReach).toContain(String(REACH_MINUTES));
  });
});
