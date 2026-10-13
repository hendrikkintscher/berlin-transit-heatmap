// Small line icons drawn like the ones in index.html (24 grid, 2 px stroke, currentColor),
// in place of emoji that look different on every phone.

const svg = (size: number, body: string) =>
  `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const PATHS = {
  people:
    '<circle cx="9" cy="8" r="3.2"/><circle cx="16.5" cy="9" r="2.6"/><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5M14.5 14.2c3 0 5.6 1.4 6.3 4.8"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  wheelchair:
    '<circle cx="11" cy="4.5" r="1.6"/><path d="M11 8v6h6l2.5 5"/><path d="M8 11a5.5 5.5 0 1 0 7.5 6.5"/>',
  // Two bars side by side: this map against another time.
  compare: '<path d="M4 20h16M8 20V9M16 20V4"/>',
  // Which way: Start and Ziel change places.
  swap: '<path d="M8 4v16M8 4L4.5 7.5M8 4l3.5 3.5M16 20V4M16 20l-3.5-3.5M16 20l3.5-3.5"/>',
  // The map's rings around the place it is computed from.
  rings:
    '<circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="10.5" opacity=".55"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  starFilled:
    '<path fill="currentColor" d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
};

export type IconName = keyof typeof PATHS;

export const icon = (name: IconName, size = 18) => svg(size, PATHS[name]);
