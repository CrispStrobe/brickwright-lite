// Parser acquisition belongs to a selected CSV upload, not GUI startup.
const loadCsvParser = () => import(/* webpackChunkName: "csv-parser" */ 'papaparse')
    .then(module => module.default);

// Dependency injection is local to this factory. The production instance below
// always uses the real document and the existing Papa parser module.
export const createCsvImporter = ({loadParser = loadCsvParser, getDocument = () => document} = {}) =>
    () => new Promise((resolve, reject) => {
        const ownerDocument = getDocument();
        const fileInput = ownerDocument.createElement('input');
        fileInput.setAttribute('type', 'file');
        fileInput.setAttribute('accept', '.csv, .tsv, .txt'); // parser auto-detects delimiter
        const ownerBody = ownerDocument.body;
        let selected = false;
        let settled = false;
        const finish = (failed, value) => {
            if (settled) return;
            settled = true;
            try {
                ownerBody.removeChild(fileInput);
                if (failed) reject(value);
                else resolve(value.data);
            } catch (error) {
                // Preserve an existing parser/load failure's identity. Removal
                // failure on an otherwise successful parse rejects this picker.
                reject(failed ? value : error);
            }
        };
        fileInput.onchange = e => {
            if (selected) return;
            selected = true;
            const file = e.target.files[0];
            // No module-level promise: a failed chunk may be requested again
            // by the next picker. Synchronous parser throws reject this owner.
            Promise.resolve().then(loadParser).then(Papa => {
                Papa.parse(file, {
                    header: false,
                    complete: results => finish(false, results),
                    error: error => finish(true, error)
                });
            }).catch(error => finish(true, error));
        };
        ownerBody.appendChild(fileInput);
        fileInput.click();
    });

export default createCsvImporter();
