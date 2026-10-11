# Roadmap

Ideas queued after the alpha (live at https://hendrikkintscher.github.io/berlin-transit-heatmap/). Not scheduled yet; order is not priority.

## Meeting point: intersect two start points

Pick two start points and show where both people can get to within the same time, as in Mapnificent and the ÖPNV-Isochronenkarte Deutschland. Shade each cell by the slower of the two trips (max of both travel times), so the map answers "where can we both be in N minutes?". Same Day/Night windows as the single-point map.

Notes: run the router twice in the worker and combine the two grids; needs a second-marker UI and a URL parameter for the second point.

## Stop-frequency layer

A layer showing how often each stop is served, e.g. departures per hour in the Day and Night windows, drawn as sized or coloured stop markers.

Notes: can be precomputed in timetable-build from stop_times per window and shipped as a small extra file.

## Transit-desert layer

A layer highlighting places that public transport serves poorly, e.g. areas far from any stop or only near stops with low frequency.

Notes: builds on the stop-frequency data (walking distance to the nearest stop weighted by its frequency); the exact definition and thresholds are still to be chosen.
