# Bounded conversion audit transcript

## Purpose and acceptance

`scripts/compat-audit.mjs --stdio-transcript` sends the ordinary progress journal,
complete compressed JSON report and Markdown through stdout. It lets an outer
supervisor own the output descriptors while the converter has read-only input
and dependency paths. The default file-output CLI keeps its existing behavior.

This transport is an implementation candidate. It does not establish process
isolation, correct original MakeCode execution, a successful application journey
or a new corpus result. The complete writer, independent decoder, actual CLI,
default-path and report-admission controls must pass before use. Real read-only
process qualification and the complete private assessment remain separate.

The complete writer, existing journal and independent decoder modules now pass
all 23 controls with no skips or TODOs on Node 22. An independent saved-output
review checked the full test selection, source and dependency identities, raw
deflate consumption, checksums, framing and bounds. This source/unit result does
not include the actual CLI integration cases, VM or original-SDK controls,
report admission, read-only process isolation or the private corpus.

The flag conflicts with `--out`, `--markdown` and `--progress-jsonl`; conflicts
are rejected before output acquisition. There are no CLI flags for another FD
or larger limits. Only the deliberate summary moves to stderr. Other stdout
bytes make the transcript invalid; the decoder never skips noise or repairs it.

## Wire format, version 1

All sizes are bytes. The stream starts with the eight bytes
`42 57 41 53 30 30 31 0a` (`BWAS001` followed by LF).

Each frame has this 12-byte header, followed by exactly the declared payload:

| Offset | Width | Value |
| --- | --- | --- |
| 0 | 1 | Type: progress 1, gzip report 2, Markdown 3, terminal 4 |
| 1 | 1 | Flags, exactly zero |
| 2 | 2 | Reserved unsigned big endian integer, exactly zero |
| 4 | 4 | Unsigned big endian sequence, starting at zero |
| 8 | 4 | Unsigned big endian payload size |

Progress frames may repeat. There is exactly one report, followed by exactly
one Markdown frame and finally one terminal frame. Progress may occur between
report frames as the actual journal records serialization and writing. No bytes
follow the terminal. Unknown types, flags, sequence gaps, duplicate singleton
frames, truncated headers and truncated payloads are refused.

The entire transcript, including magic, headers and terminal, is limited to
8,388,608 bytes. Every nonterminal write reserves 16,384 bytes for the terminal,
including its header. Each progress frame contains one original compact JSON
row followed by LF: at most 16,384 bytes per row and 65,536 rows. No partial
writes, diagnostics or rows are silently dropped to fit a limit.

The first progress phase is `CLI_PROGRESS_BEGIN`; the last is
`CLI_REPORTS_FINISHED`. Nothing follows that phase in the journal. The actual
progress encoder retains its phase, subject, sequence and cost fields.

The report is a single complete gzip member containing the exact ordinary
`JSON.stringify(report, null, 2) + '\n'` bytes. Decoded output is limited to
67,108,864 bytes. The decoder checks bounded inflation, complete consumption,
CRC32 and ISIZE. Concatenated members, padding and trailing bytes are refused.
Report JSON and Markdown must be valid UTF-8; invalid bytes are never replaced.
The complete Markdown serializer is unchanged.

The terminal is compact canonical JSON without LF, using exactly this key order
and these nested key orders:

```json
{"schema":"brickwright/compat-stdio-terminal/v1","frameCount":0,"intendedExitCode":0,"progress":{"bytes":0,"sha256":"..."},"report":{"gzipBytes":0,"gzipSha256":"...","jsonBytes":0,"jsonSha256":"..."},"markdown":{"bytes":0,"sha256":"..."}}
```

The example shows the shape only. Actual counts and SHA256 values must match
the payloads. All counts are safe nonnegative integers; hashes are lowercase
64-digit hexadecimal. `frameCount` includes the terminal itself.
`intendedExitCode` is exactly 0 or 1. The progress digest covers all original
progress payloads concatenated in order. Report digests cover both exact gzip
bytes and decoded JSON bytes.

## Lifetimes and failure handling

The CLI retains its ordinary report and Markdown phase ordering. After the
summary and unchanged exit-policy assignment, it marks `CLI_REPORTS_FINISHED`,
successfully closes the logical progress journal, then writes the terminal.
Logical close does not close stdout. No terminal is issued after a journal,
serialization or output failure. Short writes are completed; zero or impossible
write counts fail. The original thrown value remains primary even when it is falsy.

The filename progress factory still owns its exclusive fresh file, protected
path checks, permissions and actual FD close. The default CLI acquires neither
the optional transport nor a journal when neither is requested.

## Independent consumption

`scripts/private-assessment/read-stdio-transcript.mjs` imports no producer, CLI
or progress implementation. `readAssessmentTranscript({transcript})` accepts a
Buffer and returns:

- `reportJson`: the exact decoded JSON string;
- `progressJsonl`: the exact concatenated journal string;
- `markdown`: the original Markdown Buffer;
- `terminal`: the validated terminal metadata.

The trusted outer consumer must separately compare the actual waited child exit
with `terminal.intendedExitCode`. Framing metadata is not process-exit authority.
A complete report containing conversion refusals may intentionally exit 1.

Pass `reportJson` and `progressJsonl` unchanged to the existing `admitReportData`
with an independently admitted expectation. Framing does not authenticate an
input catalogue or replace the report reader's subject, provenance, phase and
completeness checks. Retain original stdout and stderr privately, along with
reconstructed artifacts and encrypted output. All copies count toward the
outer storage budget. An eight MiB transcript does not establish aggregate
storage, inode, RAM or CPU bounds.

## Remaining work

1. Qualify complete writer, decoder, progress, CLI and admission modules. Include
   independent malformed framing and gzip fixtures, real partial writes,
   failure identity, output limits, and public synthetic catalogue CLI runs.
2. Bind the actual source, normal dependency closure and interpreter. Qualify
   real read-only process behavior, forbidden filesystem writes, output FDs,
   cleanup, resource enforcement and negative marker controls.
3. Qualify the hosted resource contract and perform one complete private corpus
   assessment. Keep baseline applications separate from context revisits, and
   preserve every refusal and malformed input. Historical totals stay unchanged
   until the complete assessment is independently checked.
