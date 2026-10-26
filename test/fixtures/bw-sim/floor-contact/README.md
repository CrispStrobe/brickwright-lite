# Floor-contact inputs

These are byte-identical copies of the served Sarrus inputs named in manifest.json.
The intact drive remains unchanged when applied to the single-chain control. Its
program need not finish when the linkage is blocked; floor safety is assessed
separately and a timeout is never called program completion. Existing intact
Sarrus assertions remain required. Licences are retained beside the inputs.

The historical ZIP-source fixtures are deliberately not the served input.
The baseline kernel is retained byte-exact and checked against its recorded
source hash. Candidate identity is measured from the tested checkout, so an
unrelated future core edit does not require changing the old failure control. It runs in a separate Node
process through a source load hook; shared source files are never overwritten.
No clock, pose or engine result is substituted. Only the existing test helper's
clock simulation and read-only fixed-step observations are used.

Real engine cases run in hosted qualification. Local source and manifest checks
do not establish physics acceptance. Source inputs are public project files;
there is no hardware, reference-firmware or physical-calibration claim.
