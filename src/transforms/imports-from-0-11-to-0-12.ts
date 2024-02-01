import { API, FileInfo, Options, ImportSpecifier } from "jscodeshift";

export default function transformer(fileInfo: FileInfo, api: API, options: Options) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  const oldSpecifierName = 'foo';
  const oldSpecifierSource = '@wasp/server';
  const newSpecifierName = 'newFoo';
  const newSpecifierSource = 'wasp/server';

  let newSpecifiers: ImportSpecifier[] = [];

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
          newSpecifiers.push(j.importSpecifier(j.identifier(newSpecifierName), specifier.local));
          return false;
        }
        return true;
      });

      // Remove old specifier from the import declaration.
      if (remainingSpecifiers.length) {
        path.value.specifiers = remainingSpecifiers;
      } else {
        j(path).remove();
      }
    });

  // Add new import declaration, with all the new specifiers we collected.
  root.find(j.Program).forEach((path) => {
    path.node.body.unshift(
      j.importDeclaration(
        newSpecifiers,
        j.literal(newSpecifierSource)
      )
    )
  });

  return root.toSource();
}