// Original Brickwright-authored fixture: mutable bytes, dynamic enum, custom alias and slice.
export const BUFFER_CONTROLLER_CODE = `DEVICE ARCADE
GLOBAL bytes
GLOBAL copy
GLOBAL hex
GLOBAL copyHex
GLOBAL format
GLOBAL currentNumber
GLOBAL phase
SPRITE Game:
DEFINE rewrite (value):
  arcade set byte buffer value byte at 3 to 9
WHEN flag clicked:
  set bytes to (arcade byte buffer from hex text "01020304")
  set format to 4
  set currentNumber to (arcade byte buffer bytes number UInt16LE at 0)
  set hex to (arcade byte buffer bytes to hex)
  set phase to 0
WHEN space key pressed:
  arcade set byte buffer bytes number (format) at 0 to 4660
  set currentNumber to (arcade byte buffer bytes number (format) at 0)
  set hex to (arcade byte buffer bytes to hex)
  set phase to 1
WHEN b key pressed:
  set copy to (arcade byte buffer bytes slice at 0 length 4)
  arcade set byte buffer copy byte at 0 to 99
  set copyHex to (arcade byte buffer copy to hex)
  set hex to (arcade byte buffer bytes to hex)
  set phase to 2
WHEN down arrow key pressed:
  rewrite bytes
  set hex to (arcade byte buffer bytes to hex)
  set phase to 3
`;
