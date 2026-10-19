namespace own {
    export class Sprite { constructor() {} }
}
class Box { constructor(public value: number) {} }
let typeCalls = 0
function sample(): string { typeCalls += 1; return "[1,2]雪🙂" }
let numbers = [1, 2]
let numbersAlias = numbers
let ownedImage = image.create(1, 1)
let ownedBuffer = control.createBuffer(0)
let ownedBox = new Box(3)
let ownedName = new own.Sprite()
let ownedDialog = new game.BaseDialog(32, 20)
let unset: number
let numberType = typeof 1
let booleanType = typeof false
let textType = typeof "[1,2]雪🙂"
let emptyType = typeof ""
let nullType = typeof null
let missingType = typeof unset
let arrayType = typeof numbers
let imageType = typeof ownedImage
let bufferType = typeof ownedBuffer
let classType = typeof ownedBox
let nameType = typeof ownedName
let dialogType = typeof ownedDialog
let callType = typeof sample()
let literalType = typeof "arcade:1"
let typeSame = numbers === numbersAlias
let typeWords = numberType + "|" + booleanType + "|" + textType + "|" + emptyType + "|" + nullType + "|" + missingType + "|" + arrayType + "|" + imageType + "|" + bufferType + "|" + classType + "|" + nameType + "|" + dialogType + "|" + callType + "|" + literalType
let typeWitness = ""
let typeComplete = 0
game.onUpdate(function () { typeWitness = typeWords; typeComplete = 1 })
