import { API, FileInfo, Options, ImportSpecifier } from "jscodeshift";

export default function transformer(fileInfo: FileInfo, api: API, options: Options) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  const oldSpecifierName = 'foo';
  const oldSpecifierSource = '@wasp/server';
  const newSpecifierName = 'newFoo';
  const newSpecifierSource = 'wasp/server';

  let newImports: Map<string, ImportSpecifier[]> = new Map();

  function addImport(source: string, specifier: ImportSpecifier) {
    const existingSpecifiers = newImports.get(source);
    if (existingSpecifiers) {
      existingSpecifiers.push(specifier);
    } else {
      newImports.set(source, [specifier]);
    }
  }

  root
    .find(j.ImportDeclaration, {
      source: {
        type: "Literal",
        value: oldSpecifierSource,
      },
    })
    .forEach((path) => {
      const specifiers = path.value.specifiers;
      if (!specifiers) return;

      const remainingSpecifiers = specifiers.filter((specifier) => {
        if (specifier.type === "ImportSpecifier" && specifier.imported.name === oldSpecifierName) {
          const newSpecifier = j.importSpecifier(j.identifier(newSpecifierName), specifier.local)
          addImport(newSpecifierSource, newSpecifier);
          return false;
        }
        return true;
      });

      // Remove old specifier from the import declaration,
      // or remove whole import declaration if it has no specifiers left.
      if (remainingSpecifiers.length) {
        path.value.specifiers = remainingSpecifiers;
      } else {
        j(path).remove();
      }
    });

  // Add new import declarations, with all the new specifiers we collected.
  root.find(j.Program).forEach((path) => {
    newImports.forEach((specifiers, source) => {
      path.node.body.unshift(
        j.importDeclaration(
          specifiers,
          j.literal(source)
        )
      )
    });
  });

  return root.toSource();
}