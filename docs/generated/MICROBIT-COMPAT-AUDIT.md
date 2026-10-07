# Conversion compatibility audit

Generated 2026-10-07T06:24:39.316Z; 215 files. A parsed project has not necessarily run correctly.

Source commit: ba2bbf17dddf99bcef523a1d5efa7139eaa3878b; dirty: false. Corpus declared commit: 19a52f6d65ab9e8adc90bb19a6e3ea04544a1339 (not independently verified).

Runtime smoke only steps 24 frames. Behavioral equivalence is not measured.

## Gap ranking by affected projects

| projects | occurrences | family |
|---:|---:|---|
| 3 | 3 | microbit: turtle.forward() |
| 3 | 3 | microbit: turtle.turnRight() |
| 2 | 2 | microbit: turtle.setPosition() |
| 2 | 2 | microbit: turtle.turnLeft() |
| 1 | 1 | microbit: blockchain.addBlock() |
| 1 | 1 | microbit: blockchain.length() as a value |
| 1 | 1 | microbit: blockchain.valuesFrom() as a value |
| 1 | 1 | microbit: bluetooth.advertiseUrl() |
| 1 | 1 | microbit: class Message (a get accessor (kind), a set accessor (kind), a get accessor (fromSerialNumber), a set accessor (fromSerialNumber), a get accessor (value), a set accessor (value), a get accessor (toSerialNumber), a set accessor (toSerialNumber)) — not translated; it calls control.createBuffer(), this._data.getNumber(), this._data.setNumber(), radio.sendBuffer(), basic.pause() |
| 1 | 1 | microbit: Code to Blocks: Line 11: Empty body: "FOREVER:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | 1 | microbit: Code to Blocks: Line 49: Empty body: "IF Winner = 1 THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | 1 | microbit: Code to Blocks: Line 68: Empty body: "IF Winner = 2 THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | 1 | microbit: game.showScore() |
| 1 | 1 | microbit: led.enable() |
| 1 | 1 | microbit: loops.everyInterval() |
| 1 | 1 | microbit: message.send() |
| 1 | 1 | microbit: Message() as a value |
| 1 | 1 | microbit: radio.onReceivedBuffer() |
| 1 | 1 | microbit: radio.onReceivedValue() |
| 1 | 1 | microbit: radio.sendValue() — the name is not sent; the radio block sends the number alone |
| 1 | 1 | microbit: radio.writeReceivedPacketToSerial() — the dump prints each packet's send time, and a MicroPython radio packet carries none |
| 1 | 1 | microbit: turtle.back() |
| 1 | 1 | microbit: turtle.pen() |
| 1 | 1 | microbit: turtle.setSpeed() |

| count | stage |
|---:|---|
| 203 | translated |
| 9 | pxt-compile-failed |
| 3 | partial |

## Unsupported MakeCode elements

| occurrences | element |
|---:|---|
| 3 | microbit: turtle.forward() |
| 3 | microbit: turtle.turnRight() |
| 2 | microbit: turtle.setPosition() |
| 2 | microbit: turtle.turnLeft() |
| 1 | microbit: blockchain.addBlock() |
| 1 | microbit: blockchain.length() as a value |
| 1 | microbit: blockchain.valuesFrom() as a value |
| 1 | microbit: bluetooth.advertiseUrl() |
| 1 | microbit: class Message (a get accessor (kind), a set accessor (kind), a get accessor (fromSerialNumber), a set accessor (fromSerialNumber), a get accessor (value), a set accessor (value), a get accessor (toSerialNumber), a set accessor (toSerialNumber)) — not translated; it calls control.createBuffer(), this._data.getNumber(), this._data.setNumber(), radio.sendBuffer(), basic.pause() |
| 1 | microbit: Code to Blocks: Line 11: Empty body: "FOREVER:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | microbit: Code to Blocks: Line 49: Empty body: "IF Winner = 1 THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | microbit: Code to Blocks: Line 68: Empty body: "IF Winner = 2 THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | microbit: game.showScore() |
| 1 | microbit: led.enable() |
| 1 | microbit: loops.everyInterval() |
| 1 | microbit: message.send() |
| 1 | microbit: Message() as a value |
| 1 | microbit: radio.onReceivedBuffer() |
| 1 | microbit: radio.onReceivedValue() |
| 1 | microbit: radio.sendValue() — the name is not sent; the radio block sends the number alone |
| 1 | microbit: radio.writeReceivedPacketToSerial() — the dump prints each packet's send time, and a MicroPython radio packet carries none |
| 1 | microbit: turtle.back() |
| 1 | microbit: turtle.pen() |
| 1 | microbit: turtle.setSpeed() |

## Missing Scratch opcodes

| occurrences | opcode |
|---:|---|
| 0 | none |

## External extensions requiring runtime validation or an offline implementation

| projects | extension |
|---:|---|
| 0 | none |

### Their unverified opcodes

| projects | opcode |
|---:|---|
| 0 | none |

## Failures and execution limits

| file | result |
|---|---|
| input 12 | fail |
| input 31 | fail |
| input 63 | fail |
| input 106 | fail |
| input 120 | fail |
| input 129 | pass |
| input 157 | fail |
| input 165 | fail |
| input 188 | fail |
| input 189 | fail |
