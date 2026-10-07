// Exercise the real GUI Babel rules on the native extension, without rebuilding
// the unrelated GUI graph. This catches out-of-scope helpers in embedded code.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {INTEGRATED} from './helpers/bw-integrated.mjs';
const require = createRequire(join(INTEGRATED,'package.json'));

test('the GUI webpack Babel rules preserve self-contained Arcade factories', async () => {
    const webpack = require('webpack');
    const gui = require('./webpack.config.js');
    const directory = mkdtempSync(join(tmpdir(),'bw-arcade-bundle-'));
    const compiler=webpack({mode:'development',target:'web',context:INTEGRATED,
        entry:join(INTEGRATED,'node_modules/scratch-vm/src/extensions/crispstrobe/arcade/index.js'),
        output:{path:directory,filename:'arcade.cjs',library:{type:'commonjs2'}},
        module:{rules:gui.module.rules.filter(r=>r.loader==='babel-loader').map(rule=>({...rule,options:{...rule.options,cwd:INTEGRATED}}))},
        resolve:gui.resolve,resolveLoader:{modules:[join(INTEGRATED,'node_modules'),'node_modules']},
        devtool:false,cache:false});
    try {
        const stats=await new Promise((resolve,reject)=>compiler.run((err,stats)=>err?reject(err):resolve(stats)));
        assert.equal(stats.hasErrors(),false,stats.toString({all:false,errors:true}));
        const Arcade=require(join(directory,'arcade.cjs'));
        const rt=new EventEmitter();rt.startHats=()=>[];
        const extension=new Arcade(rt);
        const blocks=extension.getInfo().blocks;
        assert.ok(blocks.some(b=>b.opcode==='spriteImage'));
        assert.ok(blocks.some(b=>b.opcode==='frameImage'));
        assert.equal(extension.spritePixel({ID:'missing',X:0,Y:0}),0);
        assert.equal(extension.backgroundColor(),0);
    } finally {
        await new Promise((resolve,reject)=>compiler.close(err=>err?reject(err):resolve()));
        rmSync(directory,{recursive:true,force:true});
    }
});
