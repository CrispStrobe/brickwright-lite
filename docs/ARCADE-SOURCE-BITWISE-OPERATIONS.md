# Arcade source bitwise operations

Source candidate under the merged source-operations claim. Qualification is
pending; existing runtime and corpus results do not qualify these new bytes.

The source binary reporter has twelve fixed selectors: `+`, `-`, `*`, `/`, `%`,
`**`, `&`, `|`, `^`, `<<`, `>>`, and `>>>`. The source unary reporter uses the
single fixed selector `~` and one `VALUE` input. Its Code form is
`arcade source unary "~" of (value)`. Selector reporters are refused.

The importer retains original PXT opaque Array arithmetic: bitwise conversion
does not read Array elements, stringify a backing body, or lend native Array
authority. Actual writer proofs admit Array-or-primitive operand unions; object,
Sprite and unknown unions remain diagnosed. Primitive-only expressions keep
their native words. Fixed bitwise operations have a Number result on normal
return; that fact does not remove operand execution or its errors.

Export separately follows every actual source bitwise operand writer, including
captured and later writers, and refuses Array-incompatible domains. A Number
result signature provides no operand permission.

Export emits ordinary PXT operators. Reimport recognizes complete helper bodies,
root bindings and every use, including renamed helpers. A helper name or type
annotation alone cannot grant authority. Parser parameter metadata is retained.
Native bitwise reporters require actual primitive input proofs on export, so an
opaque native Array refusal cannot silently become source conversion. Native
Array addition retains its existing typed join proof.

Required qualification includes complete parser, Creator, SB3, import/export and
original-PXT controls, followed by a fresh normal installation and genuine VM
controls for currentness, foreign values, runtime errors and Number consumers.
Visible fixed-selector editing, save/reopen and hosted checks remain separate.
The canonical supplier word changes need their own reviewed adoption; this
source candidate changes no dependency pins.

The new export operand-domain gate applies only to bitwise selectors and unary
complement. The six pre-existing source arithmetic selectors retain their
previous export admission. Their physical edited-operand parity needs a separate
review; this candidate does not claim to close that inherited boundary.
