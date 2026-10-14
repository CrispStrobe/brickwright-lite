function readText(): string { return laterText }
function readArray(): number[] { return laterArray }
let beforeText = readText()
let beforeArray = readArray()
let beforeTextMissing = beforeText === undefined
let beforeArrayMissing = beforeArray === undefined
let laterText = "ready"
let laterArray: number[] = []
laterArray = [1, 2]
let alias = laterArray
function forward(items: number[]): number[] {
    let local = items
    local[0] = 7
    local.push(3)
    return local
}
let returned = forward(alias)
let distinct = [7, 2, 3]
let same = returned === alias && alias === laterArray
let different = laterArray !== distinct
let labels: string[] = ["first"]
function forwardText(items: string[]): string[] {
    let local = items
    local[0] = "é雪"
    local.push("")
    return local
}
let labelAlias = forwardText(labels)
let sameLabels = labels === labelAlias
let empty = []
let nested = [empty]
let nestedAlias = nested
nestedAlias[0].push(9)
let sameNested = nestedAlias === nested
let score = 4
let score_ = 6
let complete = 0
let callbackCount = 0
let witness = ""
game.onUpdate(function () {
    if (complete === 0) {
        let local = labels
        local[0] = "after"
        callbackCount += 1
        witness = laterArray[0] + ":" + laterArray.length + ":" + labels[0] + ":" + labels.length + ":" + empty[0] + ":" + score + ":" + score_
        complete = 1
    }
})
