## iOS audit: authenticated exit ownership instead of wait UID — 2026-10-19

The fourth actual preflight refused the wait-UID comparison: Darwin returned zero,
while the authenticated pre-exit token had the helper's actual UID. The child was
reaped with zero exit and no cleanup errors; group census was never reached.
Retain this failed original. The probe now ties exit ownership to the already
verified live kernel audit token's PID/UID, retains wait UID as information and
refuses changed ownership tokens. Reviewed XNU wait code zeros but does not fill
that exit UID; runner kernel source identity is still unjoined. This changes no
permission requirement and gives supplied UID fields no authority. A separately
source-bound corrected platform event and independent original joins are still
required. General simulator group/family/app qualification remains false.
