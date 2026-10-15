// Actual first-slice SDK Image producers. An SDK type leaf cannot mint a value;
// each value must carry a token issued here for a proved factory or clone.
export function createSdkImageSourceProducers() {
    const issued=new WeakSet();
    const plain=node=>node?.type==='Call'&&!node.isNew&&!node.constructorCall&&!node.typeArguments;
    const literal=node=>node?.type==='Number'?Number(node.value):node?.type==='Unary'&&node.op==='-'&&node.argument?.type==='Number'?-Number(node.argument.value):NaN;
    const produce=dimensions=>{const token=Object.freeze({});issued.add(token);return {type:{kind:'sdk',name:'Image'},sdkImage:token,dimensions:Object.freeze([...dimensions])};};
    const isProduced=value=>value?.type?.kind==='sdk'&&value.type.name==='Image'&&issued.has(value.sdkImage);
    return {
        isProduced,
        factory(node) {
            if(!plain(node)||node.args?.length!==2)throw Error('SDK Image source requires a plain two-argument factory');
            const raw=node.args.map(literal),dimensions=raw.map(value=>value|0);
            if(raw.some(value=>!Number.isFinite(value))||dimensions.some(value=>value<0||value>2000))throw Error('SDK Image source requires proved finite safe constant dimensions');
            return produce(dimensions);
        },
        clone(node,value) {
            if(!plain(node)||node.args?.length||!isProduced(value))throw Error('SDK Image clone requires an actual proved Image and no arguments');
            return produce(value.dimensions);
        }
    };
}
