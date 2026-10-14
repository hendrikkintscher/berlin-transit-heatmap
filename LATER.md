# Later

Planned, but for much later and not scheduled yet. Nothing here is on the roadmap or gets built until Hendrik moves it there; when he does, the item leaves this list and becomes a roadmap step. This file is kept identical in the repo (LATER.md) and in the project files (plan/later.md).

## Planned for later

- **UI for desktop browsers**. Hendrik (2026-10-14): "work on UI for desktop browsers". The app is laid out for phones (checked at 360×740); on a computer it shows the same phone layout stretched over a wide window. A desktop layout would use the extra room, for example with the trip card and drawer as a side panel beside the map, and work with mouse, keyboard and hover. Roadmap step 0.15.11 (layout check on devices and browsers) only fixes small breaks and lists bigger ones; the desktop layout itself is this item.
- **Personal colour coding for the heatmap**. Hendrik (2026-10-14): "adjust personal preferences in color coding for heatmap". Let each person pick their own colours and minute steps for the heatmap (the colour fill), for example another colour scale, colour-blind-friendly colours or where green ends, saved on the device. It changes only the paint, so a switch must stay one repaint with no extra routing.
- **Other regions, Oldenburg / Weser-Ems first** (after 1.0). Held until the domain and the timetable feed account are settled. Decided (Hendrik, 2026-10-12): one app and one codebase and deploy, each region at its own address (`…/berlin/`, `…/oldenburg/`) with its own manifest, name and icon, a data folder per region, favourites per region and its own nightly build. The region-ready code is in `packages/routing/src/regions.ts` (#126). Timetables from the Connect GTFS feed for Niedersachsen and Bremen (needs a free account Hendrik registers), Oldenburg plus about 40 km including Bremen, without live status at first. Details in archive/plan/regions.md (project files).
- **Own web address**. Part of the regions item and of any app store release: moving from github.io later resets everyone's favourites, so decide the domain before either starts (archive/plan/suggestions-2.md A1).
- **App store deployment (iOS, and Android only on Hendrik's word)**. Needs Hendrik's own developer accounts: Apple 99 USD a year with review, Google Play 25 USD once with a two-week closed test. iOS needs a wrapper such as Capacitor. Note: Hendrik said "don't do android app" (2026-10-13), so the Android store part stays out unless he lifts that (see Not planned). Options and shipping notes in archive/plan/android-notes.md.

## Ideas set aside

Hendrik set these aside on 2026-10-12. Kept here so they are not suggested again as new; they come back only if he asks. Write-ups in archive/plan/suggestions-2.md.

- Fare zones A/B/C on the map (C5).
- Sharing a picture of the map (C7).
- "Who can I reach": population and area within N minutes (C4).
- A dark map in dark mode, and app shortcuts on a long press of the icon (C9).

## Not planned

Hendrik (2026-10-13): "don't do android app and beta testing". Listed only so nobody plans them; they are not "later".

- **Android app** (native or TWA). Notes in archive/plan/android-notes.md.
- **Beta testing**. The beta plan is in archive/plan/beta-readiness.md.
