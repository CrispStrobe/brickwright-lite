# 386 GUI actual v6 expectation parts — 2026-10-25

**Status: claim only; reader transport repair unimplemented.** Owner: Codex x86 GUI. This is a narrow follow-up to the [finite v6 installed-entry claim](2026-10-25-x86-gui-finite-v6-package-entry.md) and the existing [actual GUI source PR](https://github.com/CrispStrobe/brickwright-lite/pull/1318). The finite v6 metadata event has been consumed once. Its observed installed graph is a candidate input for a separately reviewed actual request, not an actual GUI or guest result. The actual v6 source head still requires every enabled exact-head check and a fresh Build/request/event review. Do not select an actual event while this reader boundary is unresolved.

## Observed reader transport limit

The existing actual v6 standalone reader accepts one expected JSON file capped at 4,194,304 bytes. Its fixed expectation embeds the complete prior finite inventory original, finite template and nine Native Fontconfig originals as canonical Base64. The retained inventory original, template and Native2 event alone require 4,216,116 Base64 bytes, already 21,812 bytes beyond that cap before JSON syntax, the other native originals and official actual metadata. The unchanged positional reader therefore refuses the complete expectation before its semantic checks. This is an encoding/transport size boundary; it is not evidence of an installed-graph, guest or Build failure. Preserve the old refusal and all original bytes.

## Owned scope and closed new entry

Only `scripts/read-i80386-hdd-gui-originals.py`, `test/i80386-hdd-gui-actual.test.mjs`, and this claim file are owned for the repair. Add a distinct `--actual-v6-parts` standalone reader CLI. Keep the existing positional v4/v5/v6 routes and their exact verdicts; do not add an automatic fallback. Do not change the producer, workflow, request schema, source roster, dependency pins, free media, runtime limits, browser scenarios, reference outputs, guest predicates, official metadata requirements, or any current event/variable/body marker. No producer import belongs in the standalone reader.

The new CLI has exactly three selected inputs: a canonical manifest file, a closed component directory, and the already acquired actual-result artifact. The manifest is at most 65,536 bytes and has exactly three top-level keys: `schema`, `expected`, `parts`. `schema` is `bw.gui-hdd.actual-v6-parts-manifest.v1`. `expected` has exactly these sixteen existing scalar/official fields, with no embedded originals: `schema`, `requestSha256`, `buildSourceAdmissionSha256`, `sourceHead`, `runId`, `jobId`, `artifactId`, `artifactName`, `artifactBytes`, `artifactSha256`, `run`, `job`, `artifact`, `inventoryReferenceSha256`, `nativeFontReferenceSha256`, `nativeSourceGitSha256`. Its `schema` remains `bw.gui-hdd.actual-expectation.v6`; the existing exact typing and official joins remain authoritative.

`parts` is a closed map of exactly eleven rows, each containing only `byteLength` and `sha256`. The fixed row-to-filename mapping is:

| Row | Filename |
| --- | --- |
| `inventoryOriginal` | `inventory-original.json` |
| `inventoryTemplate` | `inventory-template.json` |
| `nativeFontOriginals.request` | `native-request.json` |
| `nativeFontOriginals.event` | `native-event.json` |
| `nativeFontOriginals.original` | `native-original.json` |
| `nativeFontOriginals.service` | `native-service.json` |
| `nativeFontOriginals.expectation` | `native-expectation.json` |
| `nativeFontOriginals.readerReport` | `native-reader-report.json` |
| `nativeFontOriginals.run` | `native-run.json` |
| `nativeFontOriginals.job` | `native-job.json` |
| `nativeFontOriginals.artifact` | `native-artifact.json` |

The component directory must contain exactly these eleven regular files, with no symlink, alias, extra child, path traversal or duplicate row. The filenames come from this source-fixed table, never from manifest-controlled paths. Read each retained original once through a bounded no-follow descriptor, preserving before/held/after identity, exact byte extent, SHA-256, read and close failures. Each role keeps its existing individual size bound. The manifest bytes **plus all eleven raw component extents** must fit the existing 4,194,304-byte aggregate limit; refuse before semantic grading if the sum, directory census or any role fails. The separate actual-result artifact retains its existing 384 MiB outer and per-role bounds. No cap is raised.

After transport validation, reconstruct the *exact old v6 expected dictionary only in memory*: retain every existing `expected` field and populate `inventoryOriginal`, `inventoryTemplate` and `nativeFontOriginals` with each verified byte length, SHA-256 and canonical Base64 of the selected raw original. Invoke the unchanged `expected_policy` and `audit` with that dictionary. Their existing Base64 roundtrips, finite v6 graph, Native2 cross-head, source21/tree, current Build, official run/job/artifact, raw event, frontend ZIP and two authored scenario joins remain required. The new transport grants no approval by itself; a positive actual verdict still needs genuine one-shot originals and separate external official metadata admission.

## Required qualification

Use pure, standalone controls with retained finite/native raw bytes to prove the old positional v6 reader still refuses an oversized complete expectation and the new route reaches the unchanged grader. For a small fixture that fits both transports, require byte-identical verdicts. Reject missing, extra, duplicate, swapped, repinned or truncated parts; symlink/nonregular/alias and changed held identities; short read, close failure, per-role or aggregate overflow; malformed manifest fields and noncanonical JSON. Include coherent finite-index, Native2, source, Build, official metadata, nested ZIP and guest-output mutants that the existing grader must continue to reject. Preserve first failure and bounded secondary facts. No actual execution, artifact GET or event selection is authorized by this docs-only claim.

Qualify the claim with its docs/source-policy checks before a separate reader implementation. The resulting source head will need its own complete exact-head CI and independent review before any actual v6 event. The actual job remains the **sole** getter of its selected current Build ZIP; the reader later grades the retained bytecopy in the distinct actual-result artifact.
