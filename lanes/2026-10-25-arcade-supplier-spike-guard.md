# Reviewed Arcade supplier adoption: SPIKE artifact guard

Status: IMPLEMENTED; complete unchanged SPIKE artifact module passes at the
reviewed exact pin. Final composed hosted qualification remains pending. Owner: Arcade integration,
continuing PR #1128. Base: `80d9092bd282fed4c8608edcc6478c63e2ce10a7`.

The merged atan2 claim lands its vocabulary upstream first, then adopts the
qualified supplier through normal sync. sb3-creator #167 has landed at
`c10bc94c38a279196441540e7f8309169c85d311`; its source change only extends
the binary-math vocabulary. The complete SPIKE artifact guard still asserts
its previous supplier SHA. Preserve this explicit guard and every artifact
assertion; do not remove it or replace it with a self-derived expected pin.

## Exact scope and evidence

- `test/lego-spike-roundtrip.test.mjs`: update only the literal expected
  sb3-creator pin and add its concise adoption rationale after checking the
  exact upstream source delta and running the complete module. Retain all
  programs, executable artifacts, refusal expectations and roundtrip checks.
- This claim and the existing Arcade handoff and next-step documents.

Run the complete module against the adopted exact supplier, with unchanged
assertion bodies; preserve its initial old-pin refusal and final result.
Keep the final hosted unit module required. No SPIKE implementation, firmware,
model, package other than the already claimed supplier adoption, workflow,
timeout, threshold or other lane's scripts are changed.

Frozen Robot Lab and x86 actual controllers that cite an older producer are
not silently retargeted or newly qualified by this narrow test update. Their
owners retain those original identities and any separate new admission work.
Require every enabled final-head check and affected Arcade runtime/editor
qualification before landing PR #1128.

The upstream source delta from the previous pin contains only the Arcade
binary-math vocabulary and its focused test. SPIKE emitter source is unchanged.
The old-pin refusal was retained, then the complete artifact/roundtrip module
passed after the strict literal update. No artifact assertion or program was
changed, and no SPIKE guest, firmware or hardware qualification is inferred.
