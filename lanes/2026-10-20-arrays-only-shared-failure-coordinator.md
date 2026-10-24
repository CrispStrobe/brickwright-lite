## Arrays-only shared failure coordinator — 2026-10-20

SOURCE candidate in the existing Arcade/Array exception lane. Native Arrays
bindings initialize a runtime failure coordinator without requiring an Arcade
block. Arcade claims a separate exclusive facet of the same coordinator; old
facets cannot acquire a replacement claim. Project cancellation and runtime
disposal retain failure tombstones and current-operation checks. No supplier,
pin, fallback conversion or successful-value authority changes.

New controls cover real authored Arrays-only execution, both actual extension
load orders, duplicate Arcade rejection, retired facet arguments, shared listener
ownership and fresh SB3 reload. Source review and the fresh normal installation are accepted at the tested
candidate. All 64 existing native controls, 17 additional lifecycle/JSON/parser
controls and both public Code/export/reimport cases pass, with independent
saved-result checks. Final composed hosted and visible authoring qualification
remain required; this does not establish complete games or corpus completion.
