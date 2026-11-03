// The start card's question entries (S015): each leads into the mode that answers it.
// "Wo treffen wir uns?" searches the first start and then the second (Treffpunkt);
// "Was erreiche ich in 30 Min.?" searches a start and shows it with "Bis 30 Min." on;
// "Wo soll ich wohnen?" shows the where-to-live map, after asking for a favourite place
// when there is none yet.

export type Question = 'meet' | 'reach' | 'living';

/** The minutes "Was erreiche ich in 30 Min.?" sets (one of the menu's "Bis N Min."). */
export const REACH_MINUTES = 30;

/** What a question entry does first: a search for what it needs, or its map at once. */
export type QuestionStep = { search: 'meet' | 'reach' | 'living' } | { show: 'living' };

export function questionOf(value: string | undefined): Question | null {
  return value === 'meet' || value === 'reach' || value === 'living' ? value : null;
}

/** The first step of a question; the where-to-live map needs at least one favourite place. */
export function firstStep(q: Question, favourites: number): QuestionStep {
  if (q === 'living' && favourites > 0) return { show: 'living' };
  return { search: q };
}
