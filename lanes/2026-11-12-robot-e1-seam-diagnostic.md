# Robot Lab E1 — tile seam contact diagnosis

Status: IMPLEMENTATION CANDIDATE. Base: `266c320d4e61`. Branch: `lane/robot-e1-seam-diagnostic-20261112`.

Scope: diagnose native order and tile-seam contacts, then integrate explicit per-model source/surface pairs backed by the separately qualified Jolt fork API. Preserve part-pair filters and default collision behavior. The coherent fix batch includes model metadata, parser/compiler/editor persistence, immutable core setup and failure cleanup, focused controls, and an admitted engine release dependency. No global enhanced-edge flag, solver threshold, judge, workflow or concurrency-policy changes are included.

Qualification: preserve the original RimRun and swapped-control behaviour and evidence; bind any new diagnostic to the actual engine, candidate source, body identities and contact order. Use a clean affected guest and independent saved-output inspection. A static source review or host-only test does not establish actual pair order or fix the seam. Native and binding changes require their own source-bound scalar/SIMD release qualification before the Lite dependency can advance.

Diagnostic implementation: standalone in-memory source instrumentation, capture and saved-output summary scripts, plus focused summary controls and a bounded observation note. Native A/B and selected-pair experiments establish a bounded ordering result for RimRun; final integrated source and release qualification remain required. See ROBOT-LAB-INTERNAL-EDGE-PAIRS.md for the session and persistence contract.
