# Rust notices workflow tag-filter test

| Owner | Status | Base | Scope |
| --- | --- | --- | --- |
| Codex | Claim only; implementation waits for this claim to merge | `eef726fe67d505733b31c599a677ab1897f96a94` | `test/rust-notices-generator.test.mjs` |

The Rust notices workflow now admits branch pushes and ignores the internal GUI HDD V8 tag. Its focused test still rejects every `push.branches` entry, so it rejects that intentional trigger shape. The implementation may update only the workflow-admission assertion in the named test. It must still prove all-branch push coverage, the internal-tag exclusion, and both existing push and pull-request input path rosters. Preserve the writer's existing fixture and semantic controls.

The generator, notices, workflow, dispatch registration, concurrency group, action pins, and time limit are outside this claim. After the claim merges, qualify the focused test change with a nonvacuous malformed-trigger control and the affected exact-head checks. This claim itself is docs only and needs the repository's source-policy and docs checks; it does not request a full CI label.
