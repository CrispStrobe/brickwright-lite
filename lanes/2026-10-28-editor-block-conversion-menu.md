# Code and blocks conversion through Edit

Owner: shared editor-menu UX maintainer. Status: CLAIMED.
Base: main cb28becdb169a1a53174e20f79a486408f418321;
source continuation: existing menu PR #1536 at 7e3f06a634b.

Expose Convert code to blocks and Generate code from blocks through Edit in Code.
Use the existing compile/fromBlocks callbacks with their unchanged implementations.
Extract the toolbar’s current compile availability into one shared predicate so
both surfaces agree on busy state, empty text, two-way languages and supported
ASM lifting. Preserve all compiler/import/export/history behavior and exclusions.

Own only importer menu provider, availability helper, its toolbar disabled
expression and relevant state notifications; shared menu rendering/subscription;
chrome labels; required mirrors; focused controls and existing chrome-sweep
browser acceptance. No compiler/fromBlocks body, GUI/history/autosave service,
model, pin, SDK policy, runtime or workflow edits. Other owners retain those hunks.

Qualification: matching toolbar/menu availability and current routing controls,
negative busy/hidden/unsupported/empty cases; real hosted browser must compile
source through Edit into actual VM blocks, then regenerate source from those
blocks after replacing the editor buffer. Do not treat host tests as product
qualification or weaken existing conversion guards. Normal direct-main docs
registration only; source merge remains gated on all exact-head enabled checks.
