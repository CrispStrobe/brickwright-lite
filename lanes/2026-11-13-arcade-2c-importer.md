# Arcade 2c: closed Number field producers at import

Status: local candidate, not qualified for merge. Owner: Arcade lane.
Base: main `354e9257c819`.

This continues the operator-approved 2c importer work after the native field
proof landed in PR1734. The implementation owns only
`closed-class-primitive-source.js`, the ordinary primitive constraint consumer
in `source-value-producers.js`, and focused importer tests. No exporter,
runtime, workflow or dependency pin changes.

A private fallback can prove a Number domain for fields and simple getters on
closed root-constructed instances. It checks actual Number arguments, definite
constructor writes, every direct field/setter writer, instance use and source
order. It never derives a domain from a field or formal annotation. Effectful
operands, aliases, captures, ambiguous writers, inheritance and nontrivial
accessor bodies remain outside this fallback. Previously evaluated effects
retain their original emission order; their initialized Number result may be
read through its actual binding.

Local source controls and meaningful mutation cuts cover positive Number
constructor/field/getter/setter paths and actual Text/Boolean, missing-writer,
read-before-construction, effectful-operand and escaped-receiver refusals.
Clean affected headless guests pass the raw field, getter/setter and earlier
effect cases through direct import, Code replay and fresh saved SB3. Enabled
exact-head checks remain required before merge. The effectful receiver/compound-accessor 2c fixture,
PXT/browser parity and full 2c row closure remain open.
