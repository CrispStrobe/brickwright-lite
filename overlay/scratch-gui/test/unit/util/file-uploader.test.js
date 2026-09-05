const mockSanitizeByteStream = jest.fn(data => data);

jest.mock('scratch-svg-renderer/src/bitmap-adapter', () => class BitmapAdapter {});
jest.mock('scratch-svg-renderer/src/sanitize-svg', () => ({sanitizeByteStream: mockSanitizeByteStream}));

import {costumeUpload, handleFileUpload} from '../../../src/lib/file-uploader';

const makeStorage = () => ({
    AssetType: {ImageVector: 'vector'},
    DataFormat: {SVG: 'svg'},
    createAsset: jest.fn((assetType, dataFormat, data) => ({
        assetId: String(data[0]),
        assetType,
        data,
        dataFormat
    }))
});

describe('SVG costume upload sanitation', () => {
    beforeEach(() => {
        mockSanitizeByteStream.mockReset();
        mockSanitizeByteStream.mockImplementation(data => data);
    });

    test('does not read the next selected file until asynchronous upload work settles', async () => {
        const originalFileReader = global.FileReader;
        const seen = [];
        let releaseFirst;
        let markFirstStarted;
        const firstStarted = new Promise(resolve => { markFirstStarted = resolve; });
        let markSecondSeen;
        const secondSeen = new Promise(resolve => { markSecondSeen = resolve; });
        global.FileReader = class FileReader {
            readAsArrayBuffer (file) {
                this.result = file.data;
                Promise.resolve().then(() => this.onload());
            }
        };
        const fileInput = {
            files: [
                {name: 'first.svg', type: 'image/svg+xml', data: new ArrayBuffer(1)},
                {name: 'second.png', type: 'image/png', data: new ArrayBuffer(1)}
            ],
            value: 'selected'
        };

        try {
            handleFileUpload(fileInput, (data, type, name) => {
                seen.push(name);
                if (name === 'first') {
                    markFirstStarted();
                    return new Promise(resolve => { releaseFirst = resolve; });
                }
                markSecondSeen();
            }, jest.fn());
            await firstStarted;
            expect(seen).toEqual(['first']);
            releaseFirst();
            await secondSeen;
            expect(seen).toEqual(['first', 'second']);
        } finally {
            global.FileReader = originalFileReader;
        }
    });

    test('sanitizes and stores concurrent uploads in selection order', async () => {
        const storage = makeStorage();
        const added = [];
        const first = costumeUpload(
            new Uint8Array([1]).buffer,
            'image/svg+xml',
            storage,
            costumes => added.push(costumes[0].assetId)
        );
        const second = costumeUpload(
            new Uint8Array([2]).buffer,
            'image/svg+xml',
            storage,
            costumes => added.push(costumes[0].assetId)
        );

        await Promise.all([first, second]);

        expect(mockSanitizeByteStream.mock.calls.map(call => new Uint8Array(call[0])[0])).toEqual([1, 2]);
        expect(added).toEqual(['1', '2']);
        expect(storage.createAsset).toHaveBeenCalledTimes(2);
    });

    test('stores nothing on sanitation failure and a later upload retries', async () => {
        const storage = makeStorage();
        const handleError = jest.fn();
        mockSanitizeByteStream.mockImplementationOnce(() => {
            throw new Error('invalid svg');
        });

        await costumeUpload(
            new Uint8Array([1]).buffer,
            'image/svg+xml',
            storage,
            jest.fn(),
            handleError
        );
        expect(handleError).toHaveBeenCalledTimes(1);
        expect(storage.createAsset).not.toHaveBeenCalled();

        const handleCostume = jest.fn();
        await costumeUpload(
            new Uint8Array([2]).buffer,
            'image/svg+xml',
            storage,
            handleCostume,
            handleError
        );
        expect(storage.createAsset).toHaveBeenCalledTimes(1);
        expect(handleCostume).toHaveBeenCalledTimes(1);
    });
});
