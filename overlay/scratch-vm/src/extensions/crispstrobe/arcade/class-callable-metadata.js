const createProvider = require('./class-callable-provider');

// Validate inert class declaration signatures for the source prelude. This
// catalogue never allocates an object, issues a frame or admits a callable cell.
module.exports = function classCallableMetadata(classes) {
    const heap = {definition(name) {
        const definition=classes.get(name);
        if(!definition)throw new Error('Class callable annotation has no declared ordinary class '+name);
        return definition;
    }};
    const provider=createProvider(null,null,heap,null);
    return Object.freeze({
        field(field) {
            if(field.valueKind!=='callable'||field.type!=='callable'||field.getter||field.setter)
                throw new Error('Invalid explicit callable field metadata');
            return provider.fieldSignature(field.callableSignature);
        },
        method(method) {return provider.methodSignature(method);}
    });
};
