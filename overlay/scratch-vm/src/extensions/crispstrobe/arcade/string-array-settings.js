// Generated from independently authored MPL-2.0 source src/compat/arcade-string-array-settings.ts.
// Source SHA256 39a7601327ecf5a8809a2d56f0e2c4938109c9b013b9cd01d4e56de2dd862453; regenerate scripts/generate-arcade-string-array-settings.mjs.
module.exports = {initialize(settings) {
// SPDX-License-Identifier: MPL-2.0
// Independently authored from observed StringArray API/storage behavior.
// This is not copied from BetterSettings; its source license is unverified.
var bwStringArraySettings;
(function (bwStringArraySettings) {
    function write(key, values) {
        let units = [];
        for (let row = 0; row < values.length; row++) {
            if (row > 0)
                units.push(-1);
            let value = values[row];
            for (let column = 0; column < value.length; column++) {
                units.push(value.charCodeAt(column));
            }
        }
        settings.writeNumberArray(key, units);
    }
    bwStringArraySettings.write = write;
    function read(key) {
        if (!settings.exists(key))
            return undefined;
        let units = settings.readNumberArray(key);
        if (!units.length)
            return [];
        let values = [];
        let value = "";
        for (let index = 0; index < units.length; index++) {
            let unit = units[index];
            if (unit === -1) {
                values.push(value);
                value = "";
            }
            else {
                value += String.fromCharCode(unit);
            }
        }
        values.push(value);
        return values;
    }
    bwStringArraySettings.read = read;
})(bwStringArraySettings || (bwStringArraySettings = {}));

return bwStringArraySettings;
}};
