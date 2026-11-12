# Robot Lab E1 — tile seam contact diagnosis

Status: CLAIMED. Base: `266c320d4e61`. Branch: `lane/robot-e1-seam-diagnostic-20261112`.

Scope: independently determine the native collision pair order, enhanced internal-edge flag state, contact normals and tile geometry for RimRun roller-to-frame contacts at abutting tile seams. Diagnostic instrumentation and tests only; coordinate any Jolt fork changes separately. No global collision policy, threshold, model, dependency pin or qualification gate changes are included.

Qualification: preserve the original RimRun and swapped-control behaviour and evidence; bind any new diagnostic to the actual engine, candidate source, body identities and contact order. Use a clean affected guest and independent saved-output inspection. A static source review or host-only test does not establish actual pair order or fix the seam. If a native change is indicated, claim and qualify that work separately before a release or Lite pin update.
