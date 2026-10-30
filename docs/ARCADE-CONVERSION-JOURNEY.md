# Arcade conversion journey CLI

## Run the ordered journey

Use the normal integrated GUI/VM dependency installation and test resolve hook:

```sh
node --import ./scripts/lib/register-gui-scope.mjs scripts/compat-audit.mjs \
  --target arcade --journey --out report.json.gz path/to/project.mkcd
```

Input paths and full reports may contain private application data. Keep those
outside public commits, CI logs and public artifacts. The existing
`--context-catalogue` and `--context-root` options retain their separate input
identities. `--journey` rejects raw SB3 input, non-Arcade contexts and combination
with legacy `--execute`. `--journey` itself does not fetch dependencies or acquire a compiler.
Original compilation remains the separate `--compile` assessment.

The actual ordered stages are:

1. Initial import and the actual Creator produced by the conversion audit.
2. Original VM load/start and 24 manually stepped frames.
3. Current project to Code, a fresh Creator baseline and artwork capture.
4. Code VM load/start with current artwork retained.
5. Current project export, including available SVG, palette, sound and animation
   documents, returning its full MakeCode file map.
6. Fresh public synchronous import of the exact exported file strings, a fresh
   Creator and a third VM load/start.
7. Stop/quit every owned VM, retaining cleanup failures.

The fresh exported input does not borrow the original dependency certificate.
Projects whose exports need additional package resolution may therefore report
that missing capability explicitly. Implement that resolver route separately
with fresh file identities before claiming those cases work.

## Read the results

`journeyStatus` reports operation completion. `journeyCompatibility` separately
reports diagnostics; completion with warnings is not a clean result. The report
retains full observation graphs, reported and absent channels, original thrown
values, partial VM failures, exported files and unattempted stages. Observer
failures propagate rather than becoming ordinary unsupported classifications.
A `.json.gz` output compresses the complete report without dropping fields.

These are headless VM observations. Renderer pixels, audio output, controller
interaction, original-SDK equivalence and full-game behavior remain unmeasured.
The legacy audit remains a separate assessment; compile and runtime diagnostics
now retain full messages and error lists.

## Qualification and remaining work

The complete conversion-core ten-test module and two full-journey tests pass:
12 tests, zero failures or skips. Cases cover scalar values, four-frame JRES
animation and current costume documents across all three VMs, nested Creator
warnings, and partial VM-load failure retention. An initial new gallery assertion
incorrectly equated all artwork with animation resources; its failure is retained.
The corrected assertion checks the complete original ordinary-costume inventory
and animation records separately, with every current costume binding verified.

This is focused qualification, not a new corpus census. Historical results remain
147 translated / 36 partial / one malformed. Next:

- Complete the parser performance repair without changing matching order,
  mutable regex behavior or original errors; then prove the complete census fits
  the existing execution limits before scheduling it.
- Run the original ordered 184 raw plus 41 context subjects with every terminal
  row retained. Preserve original compiler outcomes and raw/context separation.
- Qualify fresh dependency resolution for exported projects that require it.
- Qualify visible Code/Blocks edits, graphics edits, controller interaction,
  save/reopen and original Arcade import separately.

Implementation: `scripts/lib/conversion-journey.mjs`; CLI:
`scripts/compat-audit.mjs`; complete controls:
`test/conversion-audit-core.test.mjs` and `test/conversion-journey.test.mjs`.
