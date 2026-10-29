# Native lockstep timing fixture: complete JSON-line writes

Owner: native protocol-test maintainer. Status: CLAIMED before implementation.

The operator requests completing the remaining qualification failures. The existing isolated lockstep test still exceeds its unchanged 2.5 ms fastest-exchange bound. Investigate the fake peer's direct JSON formatting to a TCP stream: formatting a Value can emit many small writes despite each protocol frame being one JSON line. This is a fixture-framing hypothesis, not a demonstrated production polling defect.

Own only the test module in `apps/tauri/src-tauri/src/renode_brick_state.rs`: a complete-line serialization/write helper, its standalone byte/write-count control, and emission calls inside `lockstep_steps_land_exactly_one_quantum_apart_without_polling`. Keep runtime code, other tests, all 1,000 exchanges, pre-quantum snapshots, both result/snapshot orderings, request/clock/capability assertions, deadlines, and the 2.5 ms limit unchanged. No workflow, pin, model, firmware or physics edits.

Prove that representative result/snapshot wire bytes exactly match the old formatter, while a complete accepting writer receives one buffer per line. Preserve failed originals. Validate the actual Rust module under bounded resources, then carry this source into the Arcade owner's existing qualification candidate for all enabled exact-head native/product checks and normal qualified landing. Do not dispatch an unchanged retry or claim a guest/performance result from a mock peer.
