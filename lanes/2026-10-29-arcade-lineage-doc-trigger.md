# Arcade lineage document: restore its build-input trigger

Status: DONE — source implementation; hosted integration qualification pending.
Owner: Arcade completion integration.
Isolated branch: `lane/arcade-mutable-image-pixel-source-20261029`.
Base: main `0d0c15a5fc5c4241db9939ee9849df918cf5ae77`.

The new destroyed-Sprite source control reads `docs/ARCADE-CLASS-LINEAGE.md`.
The Build push filter must therefore include this document as a governed input.
The current trigger census refuses its absence; retain that failure and the
existing complete mention/re-include equality assertions.

Scope: add only `docs/ARCADE-CLASS-LINEAGE.md` to the positive document entries
in `.github/workflows/build.yml`; update this claim and the Arcade handoff.
Do not change job selection, labels, dispatches, dependencies or other triggers.
Qualify with the document-trigger census and its existing mutation controls,
then the integration candidate's enabled exact-head checks. No full CI label is
requested by this registration. Public documentation contains no private paths.
