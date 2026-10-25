## Native legacy speech bubble ownership — 2026-10-09

Codex owns `lane/arcade-native-legacy-bubble-20261009`, stacked on PR770.
Allocate native image/sprite handles and IDs, preserve blank-image callback
ordering including pauses, Ghost/camera flags and original text updates.
Adapt the credited PXT constructor into a resumable continuation; retain the
original generated source for comparisons. Qualify replacement/clear/expiry,
scene suspension and owner destruction against original execution. Original
PXT owner destruction leaves the independent bubble alive; correct the earlier
handoff assumption. Full GUI, complex callback reentry and screen completion
remain separate gates until exercised.
Checkpoint `d51cf93c7`:47 checks pass without skips, including18 new complete
original pixel planes and existing native camera/clock/authoring/fresh-bundle
regressions. Real IDs, shared image aliases, yielding creation/destruction,
replacement/clear/expiry, independent invisible/destroyed-owner bubbles and
scene restoration match originals. Initial namespace, duplicate-persistence
and stale caller-context failures are retained. Native scroll/complex callback
reentry and shipped GUI qualification remain open; legacy coverage stays gated.
