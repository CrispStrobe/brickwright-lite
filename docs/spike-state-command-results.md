# Native Renode command completion

The native brick-state client serializes its existing closed commands. A command
uses the current snapshot sequence for `expectedSeq` and `requestId` (`input-N`).
Success requires both a matching accepted result and a later shared snapshot.
A fresh snapshot alone does not acknowledge a command. The producer currently
sends a result before its next snapshot; the client also handles the reverse
arrival order without completing early.

Result envelopes contain schemaVersion 1, type result, the exact pending
requestId and sequence, and a boolean accepted. Optional error text is accepted
only for rejection, bounded to 1024 bytes, and never returned to callers.
Optional accepted-result data must be an object of at most 32768 serialized
bytes. Unknown fields, unsolicited or duplicate replies, and mismatched replies
invalidate the feed. Existing framing and snapshot limits remain in force.

The two-second command deadline is wall-clock transport time. Rejection, timeout,
or post-send failure closes this client's connection and invalidates its cached
snapshot. Invalid arguments and target mismatches fail before sending. Commands
are not replayed. Existing callers receive the fresh snapshot; the internal
command_with_result interface additionally returns correlated data. This does
not add UART commands or a MicroPython GUI execution option.

The module tests exercise fragmented replies, snapshot-first delivery, delayed
rejection, data bounds, exact correlation, and existing EV3/NuttX command paths.
A mutation restoring snapshot-only completion makes the rejection test fail at
runtime. Evidence and transcripts are retained privately.
