## Arcade indexed modern speech — 2026-10-09

Codex owns `lane/arcade-frame-modern-speech-20261009`, stacked on PR766.
Compose original modern sayText at the owner draw position, before its sprite,
with explicit write masks so colour-zero boxes overwrite pixels. Reuse original
speech/font engines and compare complete original PXT frames. Legacy say creates
a separate sprite and remains a gap until its native identity is integrated.
No new vocabulary; preserve screen/callback diagnostics and pending GUI gates.
Checkpoint `c84f811cb`:12 new checks (11 full original frames),34 regression
checks and two fresh bundle checks pass. Initial installed-copy freshness
failure retained and resolved by actual overlay refresh. Legacy bubble identity,
HUD/effects/render callbacks and speech presentation/clock gaps remain open.
