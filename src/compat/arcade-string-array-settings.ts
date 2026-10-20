// SPDX-License-Identifier: MPL-2.0
// Independently authored from observed StringArray API/storage behavior.
// This is not copied from BetterSettings; its source license is unverified.
namespace bwStringArraySettings {
    export function write(key: string, values: string[]): void {
        let units: number[] = [];
        for (let row = 0; row < values.length; row++) {
            if (row > 0) units.push(-1);
            let value = values[row];
            for (let column = 0; column < value.length; column++) {
                units.push(value.charCodeAt(column));
            }
        }
        settings.writeNumberArray(key, units);
    }
    export function read(key: string): string[] {
        if (!settings.exists(key)) return undefined;
        let units = settings.readNumberArray(key);
        if (!units.length) return [];
        let values: string[] = [];
        let value = "";
        for (let index = 0; index < units.length; index++) {
            let unit = units[index];
            if (unit === -1) {
                values.push(value);
                value = "";
            } else {
                value += String.fromCharCode(unit);
            }
        }
        values.push(value);
        return values;
    }
}
