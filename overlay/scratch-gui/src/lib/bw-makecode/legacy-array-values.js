// Preserve the Arrays extension's coercion and standard JSON text in PXT.
// PXT's own JSON.stringify differs for control characters and non-finite values.
export const LEGACY_PARSE_SOURCE = `function __bwNamedParseValue(value: any): any {
    if (value === "") return ""
    let numeric = +value
    if (!isNaN(numeric)) return numeric
    let parsed = JSON.parse("" + value)
    return parsed === undefined ? value : parsed
}`;
export const LEGACY_JSON_SOURCE = `function __bwNamedJsonValue(value: any, stack: any[] = null): any {
    if (value === undefined) return undefined
    if (value === null) return "null"
    if (typeof value === "number") return isNaN(value) || value === Infinity || value === -Infinity ? "null" : "" + value
    if (typeof value === "boolean") return "" + value
    if (typeof value === "string") {
        let quoted = "\\\""
        for (let i = 0; i < value.length; i++) {
            let code = value.charCodeAt(i)
            let c = value.charAt(i)
            if (c === "\\\"" || c === "\\\\") quoted += "\\\\" + c
            else if (code === 8) quoted += "\\\\b"
            else if (code === 9) quoted += "\\\\t"
            else if (code === 10) quoted += "\\\\n"
            else if (code === 12) quoted += "\\\\f"
            else if (code === 13) quoted += "\\\\r"
            else if (code < 32 || (code >= 55296 && code <= 56319 && !(value.charCodeAt(i + 1) >= 56320 && value.charCodeAt(i + 1) <= 57343)) || (code >= 56320 && code <= 57343 && !(value.charCodeAt(i - 1) >= 55296 && value.charCodeAt(i - 1) <= 56319))) {
                let hex = "0123456789abcdef"
                quoted += "\\\\u" + hex.charAt((code >> 12) & 15) + hex.charAt((code >> 8) & 15) + hex.charAt((code >> 4) & 15) + hex.charAt(code & 15)
            } else quoted += c
        }
        return quoted + "\\\""
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
}`;

export const ARRAY_ACCESS_SOURCE = `function __bwArrayAccess(value: any): any[] {
    let array: any[] = value
    return array
}`;
