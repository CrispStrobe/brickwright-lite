/** Enumerate declaration syntax, not inferred runtime or native authoring support. */
import {createHash} from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');

/** Reject metadata/bundle disagreement rather than attributing declarations to another pin. */
export function verifyTargetVersions (target, bundle, versions) {
    const actual = bundle.versions;
    const packageVersion = value => typeof value === 'string' ? value.slice(value.lastIndexOf('@') + 1) : null;
    if (!actual?.target || !actual?.pxt ||
        actual.target !== packageVersion(versions?.target) || actual.pxt !== packageVersion(versions?.core)) {
        throw new Error(`Pinned MakeCode bundle/version disagreement for ${target}`);
    }
    return {target: actual.target, core: actual.pxt, tag: actual.tag || null,
        branch: actual.branch || null, sourceCommits: actual.commits || null};
}

/** Preserve editor annotations and parse scalar keys without inventing defaults. */
export function parsePxtMetadata (rawLines) {
    const entries = [], unparsedLines = [];
    for (const rawLine of rawLines) {
        let input = rawLine.replace(/^\s*\/\/%\s*/, ''), failed = false;
        while (input.trim()) {
            input = input.trimStart();
            const key = /^[A-Za-z0-9_.-]+/.exec(input);
            if (!key) { failed = true; break; }
            input = input.slice(key[0].length);
            if (/^\s*=/.test(input)) input = input.trimStart();
            if (!input.startsWith('=')) { entries.push({key: key[0], flag: true}); continue; }
            input = input.slice(1).trimStart();
            let rawValue;
            if (input.startsWith('"') || input.startsWith("'")) {
                const quote = input[0]; let end = 1, closed = false;
                while (end < input.length) {
                    if (input[end] === '\\') { end += 2; continue; }
                    if (input[end++] === quote) { closed = true; break; }
                }
                if (!closed) { failed = true; break; }
                rawValue = input.slice(0, end); input = input.slice(end);
            } else {
                rawValue = /^\S*/.exec(input)[0]; input = input.slice(rawValue.length);
            }
            entries.push({key: key[0], rawValue,
                value: /^['"]/.test(rawValue) ? rawValue.slice(1, -1) : rawValue});
            if (input && !/^\s/.test(input)) { failed = true; break; }
        }
        if (failed) unparsedLines.push(rawLine);
    }
    return {rawLines, entries, unparsedLines};
}

export function censusTarget (ts, target, bundle, versions) {
    const declarations = [], packages = [], unresolved = [], excluded = [];
    const all = bundle.bundledpkgs || {};
    const normalize = value => String(value).replace(/\s+/g, ' ').trim();
    for (const [packageName, files] of Object.entries(all).sort(([a], [b]) => a.localeCompare(b))) {
        let manifest;
        try { manifest = JSON.parse(files['pxt.json']); }
        catch { unresolved.push({package: packageName, kind: 'missing-or-invalid-manifest'}); continue; }
        const dependencies = Object.entries(manifest.dependencies || {}).map(([name, version]) => ({
            name, version, resolution: name in all ? 'bundled' : 'external-or-missing'}));
        const declaredFiles = Array.isArray(manifest.files) ? manifest.files : [];
        const testFiles = new Set(manifest.testFiles || []);
        const info = {name: packageName, manifestSha256: hash(files['pxt.json']),
            dependencies, conditionalFiles: manifest.fileDependencies || null, files: [], testFiles: [...testFiles].sort(),
            boundary: 'bundled package; optional, board-specific and default-project reachability are not inferred'};
        packages.push(info);
        for (const dep of dependencies.filter(dep => dep.resolution !== 'bundled')) {
            unresolved.push({package: packageName, kind: 'dependency-boundary', dependency: dep.name, version: dep.version});
        }
        for (const filename of declaredFiles) {
            if (testFiles.has(filename)) { excluded.push({package: packageName, file: filename, reason: 'manifest-test-file'}); continue; }
            if (!/\.tsx?$/.test(filename)) continue;
            if (typeof files[filename] !== 'string') {
                unresolved.push({package: packageName, file: filename, kind: 'manifest-source-missing'}); continue;
            }
            const source = files[filename], sourceSha256 = hash(source);
            info.files.push({file: filename, sourceSha256});
            const sf = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
            for (const error of sf.parseDiagnostics || []) {
                unresolved.push({package: packageName, file: filename, kind: 'parse-diagnostic',
                    start: error.start, code: error.code, message: ts.flattenDiagnosticMessageText(error.messageText, ' ')});
            }
            const fileAmbient = /\.d\.ts$/.test(filename);
            const external = ts.isExternalModule(sf);
            const flag = (node, kind) => (node.modifiers || []).some(modifier => modifier.kind === kind);
            const nodeName = node => node.name ? normalize(node.name.getText(sf)) : '';
            const qualified = (parent, name) => parent ? `${parent}.${name}` : name;
            const signature = node => normalize(source.slice(node.getStart(sf), node.body ? node.body.getStart(sf) : node.end));
            const initializerEvidence = initializer => {
                const literal = ts.isLiteralExpression(initializer) ||
                    [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(initializer.kind) ||
                    ts.isPrefixUnaryExpression(initializer) && ts.isNumericLiteral(initializer.operand);
                return {initializerSha256: hash(initializer.getText(sf)),
                    initializerSyntax: ts.SyntaxKind[initializer.kind],
                    ...(literal ? {initializerPreview: normalize(initializer.getText(sf)).slice(0, 256)} : {})};
            };
            const emit = (node, kind, qname, visibility, text = signature(node), extra = {}) => {
                const position = sf.getLineAndCharacterOfPosition(node.getStart(sf));
                const comments = ts.getLeadingCommentRanges(source, node.getFullStart()) || [];
                const metadata = parsePxtMetadata(comments.flatMap(comment => source.slice(comment.pos, comment.end).split('\n'))
                    .filter(line => /^\s*\/\/%/.test(line)).map(line => line.trim()));
                declarations.push({target, package: packageName, file: filename, sourceSha256,
                    qualifiedName: qname, kind, visibility, signature: text,
                    line: position.line + 1, metadata, ...extra});
            };
            const visible = (node, parent, ambient) => ambient || flag(node, ts.SyntaxKind.ExportKeyword) || (!parent && !external);
            const visibility = (node, parent, ambient) => ambient ? 'ambient-public-declaration' :
                flag(node, ts.SyntaxKind.ExportKeyword) ? 'explicit-export' : !parent && !external ?
                    'global-script-candidate-publicness-unresolved' : 'not-exported';
            function members (node, parent, ambient) {
                for (const member of node.members || []) {
                    if (flag(member, ts.SyntaxKind.PrivateKeyword) || flag(member, ts.SyntaxKind.ProtectedKeyword) ||
                        member.name?.kind === ts.SyntaxKind.PrivateIdentifier) continue;
                    const name = nodeName(member) || (ts.isConstructorDeclaration(member) ? 'constructor' :
                        ts.isIndexSignatureDeclaration(member) ? '[index]' : ts.isCallSignatureDeclaration(member) ? '[call]' : '[construct]');
                    const kind = ts.isConstructorDeclaration(member) ? 'constructor' :
                        ts.isMethodDeclaration(member) || ts.isMethodSignature(member) ? 'method' :
                        ts.isGetAccessorDeclaration(member) ? 'getter' : ts.isSetAccessorDeclaration(member) ? 'setter' :
                        ts.isIndexSignatureDeclaration(member) ? 'index-signature' : ts.isCallSignatureDeclaration(member) ? 'call-signature' :
                        ts.isConstructSignatureDeclaration(member) ? 'construct-signature' : 'property';
                    let text = signature(member), extra = {};
                    if (member.initializer) {
                        text = normalize(source.slice(member.getStart(sf), member.initializer.getStart(sf)).replace(/=\s*$/, ''));
                        extra = initializerEvidence(member.initializer);
                    }
                    emit(member, kind, qualified(parent, name), ambient ? 'ambient-member' : 'public-member', text,
                        {...extra, implementation: Boolean(member.body), static: flag(member, ts.SyntaxKind.StaticKeyword)});
                    // Parameter properties are public class members as well as constructor arguments.
                    if (ts.isConstructorDeclaration(member)) for (const parameter of member.parameters) {
                        if (flag(parameter, ts.SyntaxKind.PrivateKeyword) || flag(parameter, ts.SyntaxKind.ProtectedKeyword)) continue;
                        if (flag(parameter, ts.SyntaxKind.PublicKeyword) || flag(parameter, ts.SyntaxKind.ReadonlyKeyword)) {
                            emit(parameter, 'parameter-property', qualified(parent, nodeName(parameter)), 'public-member');
                        }
                    }
                }
            }
            function visit (node, parent = '', ambient = fileAmbient, namespaceContinuation = false) {
                if (ts.isModuleDeclaration(node)) {
                    const globalAugmentation = Boolean(node.flags & ts.NodeFlags.GlobalAugmentation);
                    if (!visible(node, parent, ambient) && !namespaceContinuation && !globalAugmentation) return;
                    const name = qualified(parent, nodeName(node));
                    const nextAmbient = ambient || flag(node, ts.SyntaxKind.DeclareKeyword);
                    emit(node, ts.isStringLiteral(node.name) ? 'ambient-module' : 'namespace', name,
                        namespaceContinuation ? 'namespace-continuation' : globalAugmentation ? 'global-augmentation' : visibility(node, parent, ambient),
                        normalize(source.slice(node.getStart(sf), node.body?.getStart(sf) ?? node.end)));
                    if (node.body && ts.isModuleBlock(node.body)) node.body.statements.forEach(child => visit(child, name, nextAmbient));
                    else if (node.body) visit(node.body, name, nextAmbient, true);
                    return;
                }
                if (ts.isExportDeclaration(node) || ts.isImportEqualsDeclaration(node)) {
                    unresolved.push({package: packageName, file: filename, kind: 'alias-or-reexport-not-resolved',
                        declaration: normalize(node.getText(sf))}); return;
                }
                if (!visible(node, parent, ambient)) return;
                const exposure = visibility(node, parent, ambient);
                if (ts.isFunctionDeclaration(node)) {
                    if (!node.name) { unresolved.push({package: packageName, file: filename, kind: 'anonymous-export'}); return; }
                    emit(node, 'function', qualified(parent, nodeName(node)), exposure, signature(node),
                        {implementation: Boolean(node.body)});
                } else if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
                    const name = qualified(parent, nodeName(node));
                    const heritage = (node.heritageClauses || []).map(clause => normalize(clause.getText(sf)));
                    const text = normalize(source.slice(node.getStart(sf), node.members.pos).replace(/\{\s*$/, ''));
                    emit(node, ts.isClassDeclaration(node) ? 'class' : 'interface', name, exposure, text, {heritage});
                    if (heritage.length) unresolved.push({package: packageName, file: filename, kind: 'inherited-members-not-expanded', qualifiedName: name, heritage});
                    members(node, name, ambient);
                } else if (ts.isEnumDeclaration(node)) {
                    const name = qualified(parent, nodeName(node));
                    emit(node, 'enum', name, exposure, `${flag(node, ts.SyntaxKind.ConstKeyword) ? 'const ' : ''}enum ${nodeName(node)}`);
                    for (const member of node.members) emit(member, 'enum-member', qualified(name, nodeName(member)), exposure,
                        normalize(member.getText(sf)), {valueResolution: member.initializer ? 'source-expression-only' : 'implicit-value-not-evaluated'});
                } else if (ts.isTypeAliasDeclaration(node)) {
                    emit(node, 'type', qualified(parent, nodeName(node)), exposure);
                } else if (ts.isVariableStatement(node)) {
                    const kind = node.declarationList.flags & ts.NodeFlags.Const ? 'const' : node.declarationList.flags & ts.NodeFlags.Let ? 'let' : 'var';
                    for (const declaration of node.declarationList.declarations) {
                        if (!ts.isIdentifier(declaration.name)) { unresolved.push({package: packageName, file: filename, kind: 'destructured-public-binding'}); continue; }
                        const text = `${kind} ${declaration.name.text}${declaration.type ? ': ' + normalize(declaration.type.getText(sf)) : ''}`;
                        emit(declaration, kind, qualified(parent, declaration.name.text), exposure, text,
                            {metadata: parsePxtMetadata((ts.getLeadingCommentRanges(source, node.getFullStart()) || [])
                                .flatMap(comment => source.slice(comment.pos, comment.end).split('\n'))
                                .filter(line => /^\s*\/\/%/.test(line)).map(line => line.trim())),
                                typeResolution: declaration.type ? 'declared' : 'inferred-type-not-resolved',
                                ...(declaration.initializer ? initializerEvidence(declaration.initializer) : {})});
                    }
                }
            }
            sf.statements.forEach(node => visit(node));
        }
    }
    for (const item of declarations) if (item.metadata.unparsedLines.length) {
        unresolved.push({package: item.package, file: item.file, qualifiedName: item.qualifiedName,
            kind: 'editor-metadata-unparsed', rawLines: item.metadata.unparsedLines});
    }
    const overloads = new Map();
    for (const item of declarations.filter(item => ['function', 'method', 'constructor'].includes(item.kind))) {
        const key = JSON.stringify([item.package, item.file, item.qualifiedName, item.kind, Boolean(item.static)]);
        const group = overloads.get(key) || []; group.push(item); overloads.set(key, group);
    }
    for (const group of overloads.values()) if (group.length > 1) {
        group.forEach((item, index) => { item.overload = {recordIndex: index + 1, recordCount: group.length,
            boundary: 'Declaration/implementation syntax group; not inferred overload resolution.'}; });
    }
    // A signature identity is package-specific: mutually exclusive board packages
    // can expose the same name. Do not deduplicate them into a fictitious single API.
    declarations.sort((a, b) => `${a.package}/${a.file}:${a.qualifiedName}:${a.line}`.localeCompare(`${b.package}/${b.file}:${b.qualifiedName}:${b.line}`));
    for (const item of declarations) item.id = hash(JSON.stringify([target, versions, item.package, item.file,
        item.sourceSha256, item.qualifiedName, item.kind, item.signature, item.line]));
    return {target, versions, packages, declarations, excluded, unresolved,
        summary: {packages: packages.length, sourceFiles: packages.reduce((sum, entry) => sum + entry.files.length, 0),
            declarations: declarations.length, callableDeclarations: declarations.filter(item => ['function', 'method', 'constructor', 'call-signature', 'construct-signature'].includes(item.kind)).length,
            metadataAnnotatedDeclarations: declarations.filter(item => item.metadata.rawLines.length).length,
            globalPublicnessCandidates: declarations.filter(item => item.visibility === 'global-script-candidate-publicness-unresolved').length,
            unresolved: unresolved.length}};
}
