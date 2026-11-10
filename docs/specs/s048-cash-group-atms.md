# S048: Cash Group ATMs, OpenStreetMap against the banks' finder

Task S048 in `feature_list.json` (research). The add-on layer itself is S047
(`docs/specs/s047-add-on-layers.md`).

## Sources (2026-11-10)

- **OpenStreetMap:** the BBBike Berlin extract (OSM data of 2026-11-07, 183 MB). It covers the
  Berlin bounding box and a little beyond. Read with pyosmium: every `amenity=atm`, plus banks and
  fuel stations tagged `atm=yes`. A bank is matched by its operator, brand, network or name
  (or its Wikidata id). Geofabrik and the main Overpass server reset the connection from this
  container. GitHub Actions already downloads Geofabrik for the footpaths (`osm-refresh.yml`).
- **The banks' finder:** the Cash Group has one joint finder, `cash-group.de` ("Geldautomaten der
  Cash Group"; Commerzbank, Deutsche Bank, HypoVereinsbank, Postbank). It is run by YellowMap /
  SmartMaps: the page asks YellowMap's API with an API key issued to the Cash Group. The banks'
  own sites point to it. Measured: one normal search on the page for 10178 Berlin, giving the 20
  nearest ATMs (out to 4.5 km) and its total of 113 within 50 km. Asking the API directly was not
  done (the session's permission check refused it). See "Terms".

## Results

| measure                               | OpenStreetMap                                                           | Cash Group finder                                                          |
| ------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| ATMs in the Berlin box                | 1,434 (all banks)                                                       | –                                                                          |
| Cash Group ATMs                       | 123 tagged as one of the four banks (15 tag `network`)                  | 113 within 50 km of 10178 (as the page states)                             |
| by bank                               | Postbank 55, Commerzbank 32, Deutsche Bank 31, HVB 5                    | –                                                                          |
| with opening hours                    | 78 of 123 (often the branch's hours, 12 say 24/7)                       | 13 of 20 (none for Commerzbank)                                            |
| the finder's 20 nearest, found in OSM | 12 within 50 m as a Cash Group ATM, 14 within 100 m                     | –                                                                          |
| …as any ATM within 50 m               | 16 of 20 (4 lack the operator tag)                                      | –                                                                          |
| …not in OSM within 150 m              | 4 of 20 (Bundestag, Wilhelmstr., Lützowplatz, Friedrichstr. 88 SB-Zone) | –                                                                          |
| freshness                             | daily extracts; edits by anyone                                         | changes dated, e.g. 2026-07-23                                             |
| licence / terms                       | ODbL: free to use with attribution, the ATM file stays ODbL             | YellowMap's data under an API key for the Cash Group site; no open licence |

The OSM count (123) is above the finder's 113, but the two areas differ: OSM's is the Berlin
box, the finder's is 50 km around the centre. The finder may also cap its total. The sample is
small (20 ATMs, all within 4.5 km of the centre).

## Terms

- OSM: ODbL. The app already shows "© OpenStreetMap contributors" for the footpaths. Fits the
  nightly build in GitHub Actions without new hosts.
- The finder: copying its data means using a private API with someone else's key. The data
  belongs to a commercial provider. EU database rights cover copying a substantial part of it
  (all Berlin ATMs), and the public site would republish it. Not usable without permission.
- Without code: Hendrik could ask the Cash Group (or YellowMap) for an export or permission.

## Recommendation

OpenStreetMap as the source. Count an ATM as Cash Group by operator, brand, network or name.
Untagged ATMs are 4 of 20 in the sample; most of them stand where a Cash Group ATM is, but
they cannot be told apart without the tag. Missing or untagged ATMs can be fixed in OSM itself
(e.g. with StreetComplete or MapComplete), and then everyone has them.
