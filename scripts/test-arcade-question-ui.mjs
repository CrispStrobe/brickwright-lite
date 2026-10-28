import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp, mkdir, readFile, writeFile, rm, copyFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gui = process.env.BW_GUI_SOURCE_ROOT || path.join(root, 'packages/scratch-gui');
const require = createRequire(path.join(root, 'package.json'));
const guiRequire = createRequire(path.join(root, 'packages/scratch-gui/package.json'));
const webpack = guiRequire('webpack');
const {chromium} = require('playwright');

// Bundle the real production Question and Input components only. CSS is irrelevant
// to input semantics; it is deliberately excluded from this bounded component check.
test('production Arcade Question keyboard, paste, submission and Scratch fallback', async t => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'bw-question-ui-'));
    let browser;
    const server = createServer((request, response) => response.end('<div id="root"></div>'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        for (const relative of ['containers/question.jsx', 'components/question/question.jsx',
            'components/forms/input.jsx']) {
            const destination = path.join(temp, 'src', relative);
            await mkdir(path.dirname(destination), {recursive: true});
            const overlay = path.join(root, 'overlay/scratch-gui/src', relative);
            const source = relative.includes('forms/input') ? path.join(gui, 'src', relative) : overlay;
            await copyFile(source, destination);
        }
        for (const relative of ['components/forms/input.css', 'components/question/question.css',
            'components/question/icon--enter.svg']) {
            await writeFile(path.join(temp, 'src', relative), '');
        }
        const loader = path.join(temp, 'jsx-loader.cjs');
        await writeFile(loader, `const babel = require(${JSON.stringify(guiRequire.resolve('@babel/core'))});
module.exports = function(source) {return babel.transformSync(source, {babelrc:false,configFile:false,
plugins:[${JSON.stringify(guiRequire.resolve('@babel/plugin-transform-react-jsx'))}]}).code;};`);
        const stubLoader = path.join(temp, 'asset-loader.cjs');
        await writeFile(stubLoader, 'module.exports = () => "module.exports = {}";');
        await new Promise((resolve, reject) => webpack({
            mode: 'development', devtool: false,
            entry: path.join(temp, 'src/containers/question.jsx'),
            output: {path: temp, filename: 'question.js', library: 'ProductionQuestion'},
            resolve: {modules: [path.join(root, 'packages/scratch-gui/node_modules'), path.join(root, 'node_modules')]},
            externals: {react: 'React'},
            module: {rules: [{test: /\.jsx$/, use: loader}, {test: /\.(css|svg)$/, use: stubLoader}]}
        }, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString())) : resolve()));
        browser = await chromium.launch({headless: true});
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.addScriptTag({path: path.join(path.dirname(require.resolve('react/package.json')), 'umd/react.development.js')});
        await page.addScriptTag({path: path.join(path.dirname(require.resolve('react-dom/package.json')), 'umd/react-dom.development.js')});
        await page.addScriptTag({path: path.join(temp, 'question.js')});
        await page.evaluate(() => {
            window.answers = [];
            window.mountQuestion = prompt => {
                ReactDOM.unmountComponentAtNode(document.getElementById('root'));
                ReactDOM.render(React.createElement(ProductionQuestion.default, {
                    question: 'Answer', arcadePrompt: prompt,
                    onQuestionAnswered: answer => window.answers.push(answer)
                }), document.getElementById('root'));
            };
        });
        const input = page.locator('input');
        const simulator = await readFile(path.join(root, 'packages/scratch-gui/static/makecode/arcade/sim/sim.js'), 'utf8');
        const start = simulator.indexOf('function validateNumberInput()');
        const end = simulator.indexOf('function promptForText(', start);
        assert.ok(start >= 0 && end > start, 'retained original keyboard implementation must be present');
        const originalCleaner = simulator.slice(start, end);
        await t.test('number grammar agrees with the retained original system keyboard', async () => {
            for (const raw of ['--1', '+1e-2', 'a-.2.3', '١2', 'Infinity', '-0', '.']) {
                const expected = await page.evaluate(({source, raw}) => {
                    const input = document.createElement('input');
                    input.value = raw.slice(0, 6);
                    return new Function('input', `${source};validateNumberInput();return input.value;`)(input);
                }, {source: originalCleaner, raw});
                await page.evaluate(() => window.mountQuestion({answerLength: 6, numbersOnly: true}));
                await input.fill(raw);
                assert.equal(await input.inputValue(), expected, raw);
            }
        });
        await t.test('text limit uses UTF-16 units and Enter submits the displayed value', async () => {
            await page.evaluate(() => window.mountQuestion({answerLength: 12, numbersOnly: false}));
            assert.equal(await input.getAttribute('maxlength'), '12');
            assert.equal(await input.getAttribute('inputmode'), null);
            await input.pressSequentially('abcdefghijklmnop');
            assert.equal(await input.inputValue(), 'abcdefghijkl');
            await input.press('Enter');
            assert.equal(await page.evaluate(() => window.answers.at(-1)), 'abcdefghijkl');
        });
        await t.test('number keyboard retains one decimal and only an initial minus', async () => {
            await page.evaluate(() => window.mountQuestion({answerLength: 6, numbersOnly: true}));
            assert.equal(await input.getAttribute('inputmode'), 'decimal');
            assert.equal(await input.getAttribute('type'), null); // text input, never HTML number coercion
            await input.pressSequentially('-1x.2.-3');
            assert.equal(await input.inputValue(), '-1.23');
            await input.press('Enter');
            assert.equal(await page.evaluate(() => window.answers.at(-1)), '-1.23');
        });
        await t.test('paste clips raw text before numeric cleanup; button submits cleaned value', async () => {
            await input.fill('');
            await page.evaluate(() => navigator.clipboard.writeText('ab-1.23garbage'));
            await input.press('Control+V');
            assert.equal(await input.inputValue(), '-1.2');
            await page.locator('button').click();
            assert.equal(await page.evaluate(() => window.answers.at(-1)), '-1.2');
            await input.fill('000012345');
            assert.equal(await input.inputValue(), '000012');
        });
        await t.test('ordinary Scratch questions have no Arcade filter or length limit', async () => {
            await page.evaluate(() => window.mountQuestion(null));
            assert.equal(await input.getAttribute('maxlength'), null);
            assert.equal(await input.getAttribute('inputmode'), null);
            const answer = 'letters + 123.456 and more than twelve';
            await input.fill(answer);
            await input.press('Enter');
            assert.equal(await page.evaluate(() => window.answers.at(-1)), answer);
        });
        await t.test('zero and explicit larger limits are honored', async () => {
            await page.evaluate(() => window.mountQuestion({answerLength: 0, numbersOnly: false}));
            await input.fill('abc');
            assert.equal(await input.inputValue(), '');
            await page.evaluate(() => window.mountQuestion({answerLength: 20, numbersOnly: false}));
            await input.fill('123456789012345678901234');
            assert.equal(await input.inputValue(), '12345678901234567890');
        });
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
        await rm(temp, {recursive: true, force: true});
    }
});


test('production Stage captures each prompt and clears constraints before answering', async () => {
    const source = await readFile(path.join(root, 'overlay/scratch-gui/src/containers/stage.jsx'), 'utf8');
    const babel = guiRequire('@babel/core');
    const ast = babel.parseSync(source, {babelrc: false, configFile: false, parserOpts: {plugins: ['jsx']}});
    const stage = ast.program.body.find(node => node.type === 'ClassDeclaration' && node.id.name === 'Stage');
    const methods = stage.body.body.filter(node => ['questionListener', 'handleQuestionAnswered'].includes(node.key.name));
    assert.equal(methods.length, 2);
    stage.superClass = null;
    stage.body.body = methods;
    ast.program.body = [stage];
    const code = babel.transformFromAstSync(ast, '', {babelrc: false, configFile: false}).code;
    const Stage = new Function(`${code};return Stage;`)();
    const instance = new Stage();
    const emitted = [];
    instance.state = {};
    instance.setState = (change, callback) => {
        Object.assign(instance.state, change);
        if (callback) callback();
    };
    const runtime = {bwArcadeTextPrompt: {answerLength: 12, numbersOnly: false},
        emit: (event, answer) => emitted.push({event, answer, prompt: instance.state.arcadePrompt})};
    instance.props = {vm: {runtime}};
    instance.questionListener('Text');
    runtime.bwArcadeTextPrompt.answerLength = 6;
    assert.deepEqual(instance.state.arcadePrompt, {answerLength: 12, numbersOnly: false});
    runtime.bwArcadeTextPrompt = {answerLength: 6, numbersOnly: true};
    instance.questionListener('Number');
    assert.deepEqual(instance.state.arcadePrompt, {answerLength: 6, numbersOnly: true});
    instance.handleQuestionAnswered('-1.2');
    assert.deepEqual(emitted, [{event: 'ANSWER', answer: '-1.2', prompt: null}]);
    runtime.bwArcadeTextPrompt = null;
    instance.questionListener('Scratch');
    assert.equal(instance.state.arcadePrompt, null);
    runtime.bwArcadeTextPrompt = {answerLength: 6, numbersOnly: true};
    instance.questionListener(null);
    assert.equal(instance.state.arcadePrompt, null);
});
