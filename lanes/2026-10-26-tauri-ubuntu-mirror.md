# Tauri test bootstrap: align the existing official Ubuntu mirror policy

Status: DONE — implementation after merged claim #1438; final integration
head still requires its enabled hosted Tauri checks.
Owner: Arcade integration, carried into the next reviewed #1128 source head.
Base: main `a7f688940f96ac89771dfc533ea17dab635703b5`.

## Problem and bounded change

Tauri's test job runs Ubuntu package update/install directly. The main Build
workflow first uses the existing `scripts/prepare-playwright-apt.mjs` helper.
Align the Tauri test job with that reviewed mirror preparation before its
existing dependency installation. The helper only normalizes the known Ubuntu
mirror URI; it does not install packages or retry failed operations.

This is an observed workflow-policy difference. A long-running package install
alone does not establish its cause, and this change makes no claim to diagnose
or eliminate every package-manager or runner failure.

## Owned paths and exclusions

- `.github/workflows/tauri.yml`: only the test job's mirror-preparation step.
  Set its working directory explicitly to the repository root because this
  job normally runs commands from `apps/tauri`.
- `test/ci-playwright-setup.test.mjs`: a focused source-policy control for the
  helper call, root working directory and ordering before the unchanged install.
- This claim and the relevant Arcade integration handoff.

Reuse the helper unchanged. Preserve the exact package list, pinned Actions,
permissions and existing test/clippy commands. No timeout change, automatic
retry, SDK acquisition, product/source/model change or unscoped WebDriver,
SPIKE or EV3 job edit. Preserve original failed or cancelled observations.

## Qualification

Run the affected bounded source-policy controls, then qualify the final exact
integration head with the actually enabled hosted Tauri checks. Existing checks
on another head do not qualify it. Use the integration's normal push; no extra
full-browser label or dispatch is needed for this bootstrap edit. Merge only
after all enabled exact-head checks pass and tree/parents match the review.

## Source controls

The existing four mirror-helper controls and a new root-directory/order control
pass. The new control fails before the workflow change and detects a deliberate
wrong working directory. The workflow difference is exactly one preparation
step; all existing commands, package lists, permissions and pinned Actions are
byte-identical. No local package installation, SDK build or guest run occurred.
