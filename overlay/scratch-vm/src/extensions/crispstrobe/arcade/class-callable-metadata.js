const createProvider = require('./class-callable-provider');
const createTypes = require('./class-callable-types');

// Validate inert class declaration signatures for the source prelude. This
// catalogue never allocates an object, issues a frame or admits a callable cell.
module.exports = function classCallableMetadata(classes) {
    const heap = {definition(name) {
        const definition=classes.get(name);
        if(!definition)throw new Error('Class callable annotation has no declared ordinary class '+name);
        return definition;
    }};
    const provider=createProvider(null,null,heap,null,{sdkSchema:true}),types=createTypes(null,null,heap,null,null,{sdkSchema:true});
    return Object.freeze({
        parameter(parameter) {
            if(Object.hasOwn(parameter,'callableSignature')) {
                if(parameter.type!=='callable'||Object.hasOwn(parameter,'sdkType')||parameter.optional!==false||Object.hasOwn(parameter,'default'))
                    throw Error('Invalid explicit callable constructor parameter metadata');
                return provider.constructorParameterSignature(parameter.callableSignature);
            }
            // A plain identifier named callable remains an ordinary class,
            // never an implicit function domain or a missing-signature escape.
            if(parameter.type==='callable'&&(!classes.has('callable')||classes.get('callable').intrinsic))
                throw Error('Callable constructor parameter requires its explicit signature or a declared ordinary class');
            if(parameter.sdkType===undefined)return;
            if(parameter.type!=='Image'||types.validate(parameter.sdkType).kind!=='sdk')throw new Error('Invalid SDK Image constructor metadata');
        },
        field(field) {
            if(field.valueKind==='sdk'){
                if(field.type!=='Image'||field.getter||field.setter||field.callableSignature!==undefined||types.validate(field.sdkType).kind!=='sdk')throw new Error('Invalid SDK Image field metadata');
                return;
            }
            if(field.valueKind!=='callable'||field.type!=='callable'||field.getter||field.setter)
                throw new Error('Invalid explicit callable field metadata');
            return provider.fieldSignature(field.callableSignature);
        },
        method(method) {return provider.methodSignature(method);}
    });
};
