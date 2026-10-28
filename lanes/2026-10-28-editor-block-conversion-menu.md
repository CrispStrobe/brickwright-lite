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


Implementation: Code Edit now exposes both existing conversion callbacks through
the live editor provider. The toolbar and menu use one compile-availability
predicate. Language, text, ASM mode and busy changes refresh menu availability;
execution rechecks it. English and German labels are included.

Focused controls pass, including a 120-case comparison with the original toolbar
predicate. Compiler, fromBlocks, ASM lifting, file and example method bodies are
unchanged. The hosted chrome sweep now requires a real new VM say block, then
regenerates its text after replacing the editor buffer. Hosted exact-head build
and browser qualification remain pending in PR #1536. Do not infer product
qualification from the host controls or publish another editor owner’s changes.
