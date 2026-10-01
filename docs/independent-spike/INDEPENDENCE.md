# Independence record

The coordinator inspected Brickwright integration code and executed the shipped audited Pybricks WASM as an observable oracle. The implementer was spawned with `fork_turns: "none"` and received only `CONTRACT.md`, a synthetic data shape (`evidence/neutral-hub.js`), `evidence/implementer-observations.json`, and subsequent functional corrections. The optional data scaffold was not read by the implementer. Observations are input/output measurements, not generated runtime code or disassembly. No Pybricks source, behavioral implementation, algorithm, assembly, binary, or web content was supplied to it.

Actual namespace restrictions were attempted: `bwrap --unshare-net ...` failed with `Operation not permitted`; filesystem-only bwrap failed setting up the uid map (`Permission denied`); `unshare -n true` failed with `Operation not permitted`. Restrictions therefore were **instruction-based**, not a security boundary. The agent's cwd initially was the parent workspace, but every execution explicitly used the allowed handoff directory.

The exported implementer execution transcript is `evidence/implementer-transcript.jsonl`. Account/user identifiers, private platform instruction metadata and hidden model reasoning were redacted. All task messages, tool inputs, tool outputs and execution audit records were retained; placeholders identify the reasoning redactions. The platform stores some inter-agent messages as encrypted fields; the original contract and functional corrections are also preserved in readable form here. `evidence/implementer-tool-calls.json` indexes all 24 calls: 18 `exec` calls and 6 coordinator messages. The coordinator reviewed every execution input and output. Reads were limited to the supplied contract and observations and the agent's own authored backend/tests; writes were limited to backend, tests and worklog. Shell, Python and Node executed locally; a `prettier --version` check found no executable. There were no network/web tools, repository reads, oracle loads, session reads, dependency installations or delegated agents in its calls.

This supports an **audited, instruction-based contract-only implementation** claim for `independent-backend.js`. It does not establish OS-enforced isolation or prove absence of all possible model pretraining knowledge. Existing hub/arena/protocol/program-reader infrastructure is retained licensed code, not independently rewritten. Integration work in `backends.js`, hub ownership, the Pybricks bridge, retained protocol mappings and panes was authored by the coordinator after inspecting those interfaces and is explicitly outside the independent controller authorship claim.

Functional corrections supplied during implementation (no original code): external `clockOwner` must reject native commands/pace and freeze native step; round published percent while keeping exact deg/s; retain lowercase result keys; exclusive pace driver; cancel pending pace on ownership handover; reject externally owned waits; step publication belongs to the arena owner; quiet stopAll/cancel for batching; conventional formatting; persistent hold under an external shaft disturbance. The worklog records initial hold failure and formatting correction. Source/tests were copied verbatim after completion, with only test import/fixture paths adjusted for this repository.

The additional implementation turn received only functional stop-default and beep requirements. The contract addendum preserves them. Its further tools only edited/tested the handoff backend/tests and appended the contract/worklog. Final artifact hashes are in `evidence/independence-audit.json`.

All referenced evidence paths in this record refer to the [private execution archive](https://github.com/CrispStrobe/brickwright-firmware-private/tree/audit/independent-spike-20260930/audits/independent-spike/2026-09-30), not files in this public repository. The controller itself and its functional contract remain public.

Followup on 2026-10-01: a fresh, history-free agent authored `speed-envelope.mjs`
from a neutral function scaffold and normalized external observations. Its five
actual tool calls each launched shell commands through a bubblewrap wrapper with
only the handoff directory, standard binaries/libraries and Node mounted. A
coordinator probe verified absent repository/home paths and network failure
(ENETUNREACH). All five calls were reviewed; no unwrapped execution, web access,
repository reads, oracle binary loads or delegation occurred. The tool layer was
instruction restricted; executed shell processes used OS namespaces. The
coordinator's controller changes only dispatch requests through the new function.
Evidence is private under `2026-10-01-followup/` in the linked archive.
