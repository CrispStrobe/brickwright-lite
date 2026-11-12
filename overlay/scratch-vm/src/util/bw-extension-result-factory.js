// Metadata construction bridge only. A registered factory is not result
// authority: the actual source owner separately records the functions it makes.
// Neither this bridge nor its factories receive execution args or utilities.
const apply=Reflect.apply,get=WeakMap.prototype.get,set=WeakMap.prototype.set,has=WeakMap.prototype.has;
const factories=new WeakMap();
function register(metadata,factory){
    if(!metadata||typeof metadata!=='object'||typeof factory!=='function'||apply(has,factories,[metadata]))throw Error('Extension result factory metadata differs or was already bound');
    apply(set,factories,[metadata,factory]);
}
function prepare(metadata,serviceObject,funcName,preparedInfo){
    const factory=metadata&&apply(get,factories,[metadata]);
    return factory?factory(serviceObject,funcName,preparedInfo):null;
}
module.exports=Object.freeze({__proto__:null,register,prepare});
