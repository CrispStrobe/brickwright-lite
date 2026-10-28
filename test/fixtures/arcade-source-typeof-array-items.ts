function __bwCompareStrictEqual(left: any, right: any): boolean { return left === right }
let Game_value0 = 0
let Game_value1 = 0
let Game_value2 = 0
let Game_value3 = 0
let Game_value4 = 0
let Game_value5 = 0
let Game_value6 = 0
let Game_value7 = 0
let Game_value8 = 0
let Game_value9 = 0
let Game_value10 = 0
let Game_value11 = 0
let Game_value12 = 0
let Game_numberValue = 0
let Game_nullValue = 0
let Game_booleanValue = 0
let Game_aggregate = 0
let Game_missing = 0
let Game_alias: any[] = null
let Game_same: any[] = null
let Game_identity: any = 0
let __bwNamedArray_items: any[] = null
let __bwNamedArray_special: any[] = null
function __bwNamedJsonValue(value: any, stack: any[] = null): any {
    if (value === undefined) return undefined
    if (value === null) return "null"
    if (typeof value === "number") return isNaN(value) || value === Infinity || value === -Infinity ? "null" : "" + value
    if (typeof value === "boolean") return "" + value
    if (typeof value === "string") {
        let quoted = "\""
        for (let i = 0; i < value.length; i++) {
            let code = value.charCodeAt(i)
            let c = value.charAt(i)
            if (c === "\"" || c === "\\") quoted += "\\" + c
            else if (code === 8) quoted += "\\b"
            else if (code === 9) quoted += "\\t"
            else if (code === 10) quoted += "\\n"
            else if (code === 12) quoted += "\\f"
            else if (code === 13) quoted += "\\r"
            else if (code < 32 || (code >= 55296 && code <= 56319 && !(value.charCodeAt(i + 1) >= 56320 && value.charCodeAt(i + 1) <= 57343)) || (code >= 56320 && code <= 57343 && !(value.charCodeAt(i - 1) >= 55296 && value.charCodeAt(i - 1) <= 56319))) {
                let hex = "0123456789abcdef"
                quoted += "\\u" + hex.charAt((code >> 12) & 15) + hex.charAt((code >> 8) & 15) + hex.charAt((code >> 4) & 15) + hex.charAt(code & 15)
            } else quoted += c
        }
        return quoted + "\""
    }
    if (!stack) stack = []
    if (stack.indexOf(value) >= 0) { control.panic(42); return undefined }
    stack.push(value)
    let result = ""
    if (Array.isArray(value)) {
        let array: any[] = value
        result = "["
        for (let i = 0; i < array.length; i++) {
            let item = __bwNamedJsonValue(array[i], stack)
            if (i > 0) result += ","
            result += item === undefined ? "null" : item
        }
        result += "]"
    } else {
        result = "{"
        let keys = Object.keys(value)
        let count = 0
        for (let i = 0; i < keys.length; i++) {
            let item = __bwNamedJsonValue(value[keys[i]], stack)
            if (item !== undefined) {
                if (count > 0) result += ","
                result += __bwNamedJsonValue(keys[i], stack) + ":" + item
                count += 1
            }
        }
        result += "}"
    }
    stack.pop()
    return result
}
function __bwNamedArrayGet(array: any[], index: any): any {
    if (!array) return ""
    let value = array[+index]
    return value !== null && typeof value === "object" ? __bwNamedJsonValue(value) : value
}
    __bwNamedArray_items = ["abc","","0","null","undefined","true","[1,2]","{\"value\":2}","\"quoted\"","{\"bwUndefined\":true}","{\"bwReference\":{\"kind\":\"callable\",\"id\":\"one\",\"scope\":\"fake\"}}","é雪😀","line\nnext"]
    Game_value0 = __bwNamedArrayGet(__bwNamedArray_items, 0)
    Game_value1 = __bwNamedArrayGet(__bwNamedArray_items, 1)
    Game_value2 = __bwNamedArrayGet(__bwNamedArray_items, 2)
    Game_value3 = __bwNamedArrayGet(__bwNamedArray_items, 3)
    Game_value4 = __bwNamedArrayGet(__bwNamedArray_items, 4)
    Game_value5 = __bwNamedArrayGet(__bwNamedArray_items, 5)
    Game_value6 = __bwNamedArrayGet(__bwNamedArray_items, 6)
    Game_value7 = __bwNamedArrayGet(__bwNamedArray_items, 7)
    Game_value8 = __bwNamedArrayGet(__bwNamedArray_items, 8)
    Game_value9 = __bwNamedArrayGet(__bwNamedArray_items, 9)
    Game_value10 = __bwNamedArrayGet(__bwNamedArray_items, 10)
    Game_value11 = __bwNamedArrayGet(__bwNamedArray_items, 11)
    Game_value12 = __bwNamedArrayGet(__bwNamedArray_items, 12)
    __bwNamedArray_special = [3,null,true,[1,2]]
    Game_numberValue = __bwNamedArrayGet(__bwNamedArray_special, 0)
    Game_nullValue = __bwNamedArrayGet(__bwNamedArray_special, 1)
    Game_booleanValue = __bwNamedArrayGet(__bwNamedArray_special, 2)
    Game_aggregate = __bwNamedArrayGet(__bwNamedArray_special, 3)
    Game_missing = __bwNamedArrayGet(__bwNamedArray_special, 4)
    Game_alias = __bwNamedArray_items
    Game_same = __bwNamedArray_items
    Game_identity = __bwCompareStrictEqual(Game_alias, Game_same)
