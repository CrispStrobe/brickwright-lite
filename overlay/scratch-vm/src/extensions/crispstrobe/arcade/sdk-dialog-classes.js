// Owned declaration mirror of sdk-dialog-class-descriptors.js. A contract
// check compares these public signatures; runtime uses unchanged MIT SDK code.
let nextHost = 0;
const specifications = [
  {
    "name": "__bwSDK_BaseDialog",
    "intrinsic": "BaseDialog",
    "fields": [
      {
        "name": "image",
        "type": "Image",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "frame",
        "type": "Image",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "cursor",
        "type": "Image",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "columns",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "rows",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "unit",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "innerLeft",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "innerTop",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "cursorCount",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "textColor",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      }
    ],
    "parameters": [
      {
        "name": "width",
        "type": "number",
        "optional": false
      },
      {
        "name": "height",
        "type": "number",
        "optional": false
      },
      {
        "name": "frame",
        "type": "Image",
        "optional": true
      },
      {
        "name": "font",
        "type": "image.Font",
        "optional": true
      },
      {
        "name": "cursor",
        "type": "Image",
        "optional": true
      }
    ],
    "initializer": "__bwClass___bwSDK_BaseDialog_fields %s",
    "constructor": "__bwClass___bwSDK_BaseDialog_constructor %s %s %s %s %s %s",
    "methods": [
      {
        "name": "resize",
        "procedure": "__bwClass___bwSDK_BaseDialog_resize %s %s %s %s %s %s",
        "parameters": [
          {
            "name": "width",
            "type": "number",
            "optional": false
          },
          {
            "name": "height",
            "type": "number",
            "optional": false
          },
          {
            "name": "frame",
            "type": "Image",
            "optional": true
          },
          {
            "name": "font",
            "type": "image.Font",
            "optional": true
          },
          {
            "name": "cursor",
            "type": "Image",
            "optional": true
          }
        ],
        "returnType": "void",
        "visibility": "public"
      },
      {
        "name": "update",
        "procedure": "__bwClass___bwSDK_BaseDialog_update %s",
        "parameters": [],
        "returnType": "void",
        "visibility": "public"
      },
      {
        "name": "setText",
        "procedure": "__bwClass___bwSDK_BaseDialog_setText %s %s",
        "parameters": [
          {
            "name": "rawString",
            "type": "string",
            "optional": false
          }
        ],
        "returnType": "void",
        "visibility": "public"
      }
    ]
  },
  {
    "name": "__bwSDK_SplashDialog",
    "intrinsic": "SplashDialog",
    "parent": "__bwSDK_BaseDialog",
    "fields": [
      {
        "name": "text",
        "type": "string",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "subtext",
        "type": "string",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "timer",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "offset",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "maxOffset",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "maxSubOffset",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      }
    ],
    "parameters": [
      {
        "name": "width",
        "type": "number",
        "optional": false
      },
      {
        "name": "height",
        "type": "number",
        "optional": false
      }
    ],
    "initializer": "__bwClass___bwSDK_SplashDialog_fields %s",
    "constructor": "__bwClass___bwSDK_SplashDialog_constructor %s %s %s",
    "methods": [
      {
        "name": "setText",
        "procedure": "__bwClass___bwSDK_SplashDialog_setText %s %s",
        "parameters": [
          {
            "name": "text",
            "type": "string",
            "optional": false
          }
        ],
        "returnType": "void",
        "visibility": "public"
      },
      {
        "name": "setSubtext",
        "procedure": "__bwClass___bwSDK_SplashDialog_setSubtext %s %s",
        "parameters": [
          {
            "name": "sub",
            "type": "string",
            "optional": false
          }
        ],
        "returnType": "void",
        "visibility": "public"
      }
    ]
  }
];
const definitions = new Map(specifications.map(spec => [spec.name, Object.freeze({...spec,
    fields: new Map(spec.fields.map(field => [field.name, Object.freeze(field)])),
    methods: new Map(spec.methods.map(method => [method.name, Object.freeze(method)]))})]));
const operations = new Map();
for (const spec of specifications) {
    operations.set(spec.initializer, {spec, operation: 'fields'});
    operations.set(spec.constructor, {spec, operation: 'constructor'});
    operations.set(`__bwClass_${spec.name}_superConstructor ${['self', ...spec.parameters].map(() => '%s').join(' ')}`, {spec, operation: 'constructor'});
    for (const method of spec.methods) operations.set(method.procedure, {spec, operation: method.name});
}
function create(ext, values) {
    const runtime = ext._runtime, host = ++nextHost, instances = new Map();
    let generation = 0, nextInstance = 0, suspended = false, closed = false;
    const reset = () => {generation++; instances.clear();};
    const suspend = () => {suspended = true; reset();};
    const loaded = () => {if (!closed) {suspended = false; reset();}};
    runtime?.on?.('PROJECT_START', reset); runtime?.on?.('PROJECT_LOADED', loaded); runtime?.on?.('RUNTIME_DISPOSED', suspend);
    const key = ref => values.referenceId(runtime, ref, 'object');
    const instance = ref => {
        const state = instances.get(key(ref));
        if (closed || suspended || !state || state.generation !== generation) throw new Error('Unknown or stale native Dialog reference');
        return state;
    };
    const body = ref => {const state = instance(ref); if (!state.body) throw new Error('Native Dialog constructor has not completed'); return state.body;};
    const image = value => {
        const decoded = values.decode(value);
        if (decoded === undefined || decoded === null) return decoded;
        const raw = ext._image(value);
        if (!raw) throw new Error('Dialog image argument requires a registered Image reference');
        return ext._dialogHost.wrap(raw);
    };
    const font = value => {
        const decoded = values.decode(value);
        if (decoded !== undefined && decoded !== null) throw new Error('Dialog Font arguments require a separately qualified native Font bridge');
        return decoded;
    };
    const imageFields = new Set(['image', 'frame', 'cursor']);
    const fields = className => {
        const def = definitions.get(className);
        if (!def) throw new Error('Unsupported native Dialog class');
        return new Map([...(def.parent ? definitions.get(def.parent).fields : []), ...def.fields]);
    };
    const refresh = dialog => {if (dialog.image?.raw) ext._refreshImage(dialog.image.raw);};
    const invoke = (name, args, util, token) => {
        const operation = operations.get(name);
        if (!operation) throw new Error('Unknown SDK Dialog procedure');
        if (util?.thread && (util.thread.isKilled || !runtime.threads.includes(util.thread))) throw new Error('SDK Dialog activation was cancelled');
        const state = instance(args[0]), op = operation.operation;
        if (op === 'fields') return;
        if (op === 'constructor') {
            if (!ext._objectHeap.constructionActive(args[0], token)) throw new Error('SDK Dialog constructor no longer owns its instance');
            if (state.body) throw new Error('Native Dialog constructor already completed');
            const game = ext._gameOverModule().game, width = values.decode(args[1]), height = values.decode(args[2]);
            state.body = operation.spec.intrinsic === 'SplashDialog' ? new game.SplashDialog(width, height) :
                new game.BaseDialog(width, height, image(args[3]), font(args[4]), image(args[5]));
            refresh(state.body); return;
        }
        const dialog = body(args[0]);
        if (op === 'resize') dialog.resize(values.decode(args[1]), values.decode(args[2]), image(args[3]), font(args[4]), image(args[5]));
        else if (op === 'setText' || op === 'setSubtext') dialog[op](values.decode(args[1]));
        else if (op === 'update') dialog.update();
        else throw new Error('SDK Dialog operation is not qualified: ' + op);
        refresh(dialog);
    };
    return {matches: name => operations.has(name), invoke,
        heapHooks: {
            definition: name => definitions.get(name),
            reserve(def) {
                if (closed || suspended) throw new Error('Native Dialog registry is disposed');
                if (!definitions.has(def.name)) throw new Error('User Dialog subclasses require separate native dispatch qualification');
                const ref = values.reference(runtime, 'object', `dialog:${host}:${generation}:${++nextInstance}`);
                instances.set(key(ref), {className: def.name, generation, body: null}); return ref;
            },
            external: ref => !closed && !suspended && instances.has(key(ref)),
            externalClass: ref => instance(ref).className,
            get(ref, field) {
                const state = instance(ref);
                if (!fields(state.className).has(field)) throw new Error('Unknown or unqualified native Dialog field ' + field);
                const value = body(ref)[field];
                return imageFields.has(field) && value ? ext._imageHandle(value.raw) : values.encode(value);
            },
            set(ref, field, value) {
                const state = instance(ref);
                if (!fields(state.className).has(field)) throw new Error('Unknown or unqualified native Dialog field ' + field);
                const dialog = body(ref); dialog[field] = imageFields.has(field) ? image(value) : values.decode(value); refresh(dialog);
            }
        },
        dispose() {
            closed = true; suspend(); runtime?.off?.('PROJECT_START', reset); runtime?.off?.('PROJECT_LOADED', loaded); runtime?.off?.('RUNTIME_DISPOSED', suspend);
        }
    };
}
module.exports = {create, specifications};
