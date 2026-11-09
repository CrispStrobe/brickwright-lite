# Arcade import: String.concat receiver must be a string on every producer

Status: DONE in the implementing PR (claim and change together).
Owner: Arcade lane (import side). Found while closing row 2e.
Base: main `4b2f5047dde6a8609b5881c93b510028eb83fb07`.

`arcade-translate.js` admitted `f.concat(x)` when the receiver's producers
were a string plus other primitives, e.g. `let f:any=0; h=f.concat("b");
f="x"`, where the concat runs while `f` is still the Number 0. Original PXT
faults on a Number, null or undefined receiver; Lite produced "0b". The
receiver check now requires every producer to be a string (new
`exactStrings` reference set); the routing into the concat branch is
unchanged, so such receivers are refused with the existing diagnostic
"String.concat() receiver must be a proven string value".

Test: `makecode-string-conversion-roundtrip` "String.concat requires a
receiver that is a string on every producer" (three refusals, two accepted).
Mutation: restoring the old all-primitive check fails it.
