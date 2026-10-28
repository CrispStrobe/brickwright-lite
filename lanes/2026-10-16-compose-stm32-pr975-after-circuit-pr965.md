## Compose STM32 PR975 after circuit PR965 — 2026-10-16

DONE candidate / QUALIFICATION PENDING — Codex root, isolated `local worktree/receipt (see ignored local handoff)`,
branch `lane/stm32-compose-20261016`, base main `5cb83052330b400b48293315260cb4293b4f6bcf`.
The user explicitly requested completion of these integrations in order. PR965
is now merged; a read-only merge of PR975 `943d540c7` reports thirteen conflicts.
This lane owns only their combined integration and qualification. Preserve the
original PR975 branch and all its authored STM32 runtime/generator changes;
this is not a takeover of its supplier implementation or other ongoing lanes.

Resolve shared vendor-pins/package specifications/locks, package provenance
notices, exact-pin adoption readers and the FreeDOS workflow conflict through
the canonical writers. Retain CUI `1db1bb9ee565338672c7acfefec4cf94b27196e1`
from PR965, Board `f84ba60ead0a90deb9830f0c1468839c293ecf05` and SB3 creator
`a13f92b8bc4b06f0cb9ffec22bab71f06db7ac76` from PR975. Keep every other pin,
mirror, scoped extension and newer main change. The exact Board now passes the
original complete upstream CI and Lite evidence reader (run38918125391).
Own this ledger, conflict resolutions and any canonical derived regeneration
needed by the composed graph; no new runtime semantics, engine, gate relaxation,
workflow budget or private vendor changes. The original supplier owner's
branch stays untouched. Recheck its head before landing; incorporate subsequent
owner work rather than dropping it. Merge this claim to remote main before
implementation. Require identity/notice/pin reader controls, affected STM32
and circuit controls and all enabled exact-head CI before merging the combined
candidate; no installed or physical validation is inferred.
