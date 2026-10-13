// Bounded intrinsic descriptors for selected MIT Arcade4.2.1/PXT13.2.1
// game/textDialogs.ts. Runtime calls the unchanged SDK classes. Font objects,
// protected implementation helpers and user Dialog subclasses stay diagnosed.
const field = (name, typeName) => ({name, typeName, modifiers: []});
const method = (name, params, paramTypes, optionalParams = []) =>
    ({name, params, paramTypes, optionalParams, returnType: 'void', kind: 'method', body: [], modifiers: []});
const resizeParams = ['width', 'height', 'frame', 'font', 'cursor'];
const resizeTypes = {width: 'number', height: 'number', frame: 'Image', font: 'image.Font', cursor: 'Image'};
const base = '__bwSDK_BaseDialog', splash = '__bwSDK_SplashDialog';
export const SDK_DIALOG_CLASS_NODES = [
    {type: 'Class', name: base, sdkIntrinsic: 'BaseDialog', unsupported: [],
        fields: ['image', 'frame', 'cursor'].map(name => field(name, 'Image')).concat(
            ['columns', 'rows', 'unit', 'innerLeft', 'innerTop', 'cursorCount', 'textColor'].map(name => field(name, 'number'))),
        ctor: {params: resizeParams, paramTypes: resizeTypes, optionalParams: ['frame', 'font', 'cursor'], body: [], originalBody: []},
        methods: [method('resize', resizeParams, resizeTypes, ['frame', 'font', 'cursor']), method('update', [], {}), method('setText', ['rawString'], {rawString: 'string'})]},
    {type: 'Class', name: splash, sdkIntrinsic: 'SplashDialog', base, unsupported: [],
        fields: ['text', 'subtext'].map(name => field(name, 'string')).concat(
            ['timer', 'offset', 'maxOffset', 'maxSubOffset'].map(name => field(name, 'number'))),
        ctor: {params: ['width', 'height'], paramTypes: {width: 'number', height: 'number'}, optionalParams: [], body: [], originalBody: []},
        methods: [method('setText', ['text'], {text: 'string'}), method('setSubtext', ['sub'], {sub: 'string'})]}
];
// Qualified names only. A bare SplashDialog must first be resolved by the
// lexical game namespace; an unrelated global/local name is never guessed.
export const sdkDialogBase = name => name === 'game.BaseDialog' ? base : name === 'game.SplashDialog' ? splash : name;
export const sdkDialogPublicBase = name => name === base ? 'game.BaseDialog' : name === splash ? 'game.SplashDialog' : name;
export const SDK_DIALOG_OPAQUE_PARAMETERS = Object.freeze({[base]: {constructor: [3], resize: [3]}, [splash]: {resize: [3]}});
export const sdkDialogExportClasses = () => SDK_DIALOG_CLASS_NODES.map(node => ({
    name: node.name, intrinsic: true, parent: node.base,
    fields: node.fields.map(value => ({name: value.name, type: value.typeName, readonly: false, visibility: 'public'})),
    parameters: node.ctor.params.map(name => ({name, type: node.ctor.paramTypes[name], optional: node.ctor.optionalParams.includes(name)})),
    initializer: `__bwClass_${node.name}_fields %s`,
    constructor: `__bwClass_${node.name}_constructor ${['self', ...node.ctor.params].map(() => '%s').join(' ')}`,
    methods: node.methods.map(value => ({name: value.name, procedure: `__bwClass_${node.name}_${value.name} ${['self', ...value.params].map(() => '%s').join(' ')}`,
        parameters: value.params.map(name => ({name, type: value.paramTypes[name], optional: value.optionalParams.includes(name)})), returnType: value.returnType, visibility: 'public'}))
}));
