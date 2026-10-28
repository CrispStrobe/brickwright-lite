## iOS audit: auxiliary failure isolation — 2026-10-19

The owned-child diagnostic event also failed. The sampler announced that sampling
began, but supplied no stack report before its three-second deadline. Both owned
children were reaped. The bounded standalone reader joined the actual command and
nested diagnostic packets with interfaceComplete false; it did not prove a cause.

Those timing originals exposed a controller issue: the auxiliary failure shortened
the primary help observation to about five seconds. The v3 candidate preserves an
auxiliary failure while letting the primary command retain its original deadline.
It still refuses final success if any requested diagnostic failed. Controls prove
that all primary help queries finish when possible, while the failed auxiliary
keeps the overall result partial. No time/output limit is increased, no original
failure is relabeled and no new actual event is admitted by this source correction.
