# Conversion compatibility audit

Generated 2026-10-06T21:26:15.426Z; 215 files. A parsed project has not necessarily run correctly.

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

| projects | extension and URL |
|---:|---|
| 0 | none |

### Their unverified opcodes

| projects | opcode |
|---:|---|
| 0 | none |

## Failures and execution limits

| file | result |
|---|---|
| makecode/microbit/microbit-09623dfc9996e61a.ts | main.ts:1: Cannot find name 'turtle'. |
| makecode/microbit/microbit-25634ad1ed3d51d5.ts | main.ts:2: Cannot find name 'score'. |
| makecode/microbit/microbit-4a104830fea75907.ts | main.ts:5: Cannot find name 'datalogger'. |
| makecode/microbit/microbit-7d6ced5717e6a5cc.ts | main.ts:1: Cannot find name 'turtle'. |
| makecode/microbit/microbit-9652373fd5ffeef4.ts | main.ts:8: Cannot find name 'blockchain'. |
| makecode/microbit/microbit-9c9811482ba09982.ts | no-green-flag-thread |
| makecode/microbit/microbit-b88b01eb53bd6fe2.ts | main.ts:7: Cannot find name 'kitronik'. |
| makecode/microbit/microbit-c7b709367d2087ce.ts | main.ts:2: Cannot find name 'bluetooth'. |
| makecode/microbit/microbit-dd906554a9e190ec.ts | main.ts:2: all symbols in top-level scope are always exported; please use a namespace if you want to export only some |
| makecode/microbit/microbit-ddb74bad9ad0026c.ts | main.ts:2: Cannot find name 'turtle'. |
