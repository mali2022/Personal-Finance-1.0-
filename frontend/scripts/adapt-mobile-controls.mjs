import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// One-time source migration: leave form values, validators and API callbacks untouched.
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'tests') walk(file);
      continue;
    }
    if (
      !file.endsWith('.tsx') ||
      /(?:ResponsiveDatePicker|TouchSelect)\.tsx$/.test(file)
    )
      continue;
    const source = fs.readFileSync(file, 'utf8');
    const tree = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const changes = [];
    const additions = new Set();
    for (const node of tree.statements) {
      if (!ts.isImportDeclaration(node) || node.moduleSpecifier.text !== 'antd')
        continue;
      const bindings = node.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      const selected = bindings.elements.filter((element) =>
        ['DatePicker', 'Select'].includes(element.name.text),
      );
      if (!selected.length) continue;
      selected.forEach((element) => additions.add(element.name.text));
      const kept = bindings.elements.filter(
        (element) => !selected.includes(element),
      );
      changes.push({
        start: node.getStart(tree),
        end: node.end,
        value: kept.length
          ? `import { ${kept.map((element) => element.getText(tree)).join(', ')} } from 'antd';`
          : '',
      });
    }
    function visit(node) {
      if (
        ts.isJsxSelfClosingElement(node) &&
        node.tagName.getText(tree) === 'Input' &&
        node.attributes.properties.some(
          (attribute) =>
            ts.isJsxAttribute(attribute) &&
            attribute.name.getText(tree) === 'type' &&
            attribute.initializer &&
            ts.isStringLiteral(attribute.initializer) &&
            ['date', 'month', 'datetime-local'].includes(
              attribute.initializer.text,
            ),
        )
      ) {
        additions.add('DateInput');
        changes.push({
          start: node.tagName.getStart(tree),
          end: node.tagName.end,
          value: 'DateInput',
        });
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
    if (!changes.length) continue;
    let updated = source;
    for (const change of changes.sort((a, b) => b.start - a.start))
      updated =
        updated.slice(0, change.start) +
        change.value +
        updated.slice(change.end);
    const relative = path
      .relative(path.dirname(file), 'src/components')
      .replaceAll('\\', '/');
    const base = relative
      ? relative.startsWith('.')
        ? relative
        : './' + relative
      : '.';
    const dates = ['DatePicker', 'DateInput'].filter((name) =>
      additions.has(name),
    );
    const imports = [];
    if (dates.length)
      imports.push(
        `import { ${dates.join(', ')} } from '${base}/ResponsiveDatePicker';`,
      );
    if (additions.has('Select'))
      imports.push(`import { Select } from '${base}/TouchSelect';`);
    fs.writeFileSync(file, imports.join('\n') + '\n' + updated);
    console.log(file);
  }
}
walk('src');
