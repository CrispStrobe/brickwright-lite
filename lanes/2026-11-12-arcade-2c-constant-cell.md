# Arcade 2c: native constant logical staging

Owner: Arcade delivery maintainer. Status: IMPLEMENTED candidate; application qualification and landing pending.

Own the bounded constant-Boolean and forced local-overwrite proof in
console-inspect-values.js and focused native controls. Admit only a flat source
startup chain where a local starts from a proven constant Boolean, its only
conditional is provably taken and overwrites it with a pure numeric expression,
and the resulting read follows that overwrite without other exposure. Prove all
global guard writers, reject alternate/foreign/unknown writers, calls, aliases,
captures, earlier reads, branches, loops and uncertain conditions. Preserve all
ordinary Number/Text and Boolean/Number refusal controls and current cell owners.
This native prerequisite does not admit call-valued logical operands or finish
row 2c. Require actual-method controls, mutations and affected application
qualification before source landing. No workflow, SDK/pin, thresholds or actual
guest event changes are owned.

The candidate handles three constant AND/OR/numeric-expression shapes and
seventeen near misses; eight source cuts are detected. The original source
retains Boolean|Number and fails the new precision control. Call-valued RHS,
unknown or additional guard writers and other local exposure remain refused.
Source-level logical narrowing and full project qualification remain separate.
