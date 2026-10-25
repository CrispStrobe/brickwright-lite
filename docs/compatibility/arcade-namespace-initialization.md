# Arcade namespace initialization

The selected Arcade SDK (pxt-arcade 4.2.1 / pxt-core 13.2.1) hoists namespace procedures and numeric literal constants. Native import preserves these bindings and retains the original executable initializer order. Mutable values and constants with executable initializers require initialization before a read.

Function and class method bodies are deferred. The initialization checker follows statically resolved calls, constructors, instance field initializers, accessors and method aliases; static field initializers run at the class declaration. An early call reading an uninitialized namespace value retains a diagnostic. A dynamic class receiver with a potentially early read produces an explicit warning. This analysis does not admit unsupported class runtime features or establish an unrestricted execution call graph.

Dotted declarations such as `namespace Text.util` implicitly export the inner namespace in the selected compiler. Explicit nested namespaces remain private unless exported. Lexical access within their declaration is allowed; qualified access through a private namespace is rejected, including qualified access written inside its parent.

Warnings appear in the import result, the GUI status, the CLI notes and editable Code comments. They prevent a warning-free source compatibility claim. Namespace methods that are otherwise supported remain editable through their generated native functions and variables. General namespace object escapes, dynamic members, inheritance and other unsupported class behavior retain their separate diagnostics.

Focused controls compare unchanged authored source with the original SDK, native execution, Code decompilation, exported original execution, reimport and a fresh VM loading saved SB3. They cover dotted and lexical private namespaces, forward procedures, literal constants, deferred calls and side-effect initializer order. Initialization diagnostics also cover known early class calls and unresolved dynamic receivers. No whole-game or general class support claim follows.
