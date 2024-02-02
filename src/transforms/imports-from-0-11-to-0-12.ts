import { API, FileInfo, Options, ImportSpecifier } from "jscodeshift";

export default function transformer(fileInfo: FileInfo, api: API, options: Options) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  let newImports: Map<string, ImportSpecifier[]> = new Map();

  function addImport(source: string, specifier: ImportSpecifier) {
    const existingSpecifiers = newImports.get(source);
    if (existingSpecifiers) {
      existingSpecifiers.push(specifier);
    } else {
      newImports.set(source, [specifier]);
    }
  }

  for (const importMapping of importMappings) {
    const oldSpecifierName = importMapping.old.name;
    const oldSpecifierSource = importMapping.old.path;
    const newSpecifierName = importMapping.new.name;
    const newSpecifierSource = importMapping.new.path;

    // TODO: Handle isType, isDefault, isUserDef.
    // If we have default import, we can't assume its name!
    // What about special cases? Like user def? Or paths with variable parts?
    // Or that case where it maps to null? Handle these special cases.
    // I also want to write a nice test file.
    // And I need to add real mappings down there.
    // What about the cases where the extension is .js or .ts or jsx or ...? How can we be robust to that and how do we want to behave?

    root
      .find(j.ImportDeclaration, {
        source: {
          value: oldSpecifierSource,
        },
      })
      .forEach((path) => {
        const specifiers = path.value.specifiers;
        console.log(specifiers);
        if (!specifiers) return;

        const remainingSpecifiers = specifiers.filter((specifier) => {
          if (importMapping.old.isDefault && specifier.type === "ImportDefaultSpecifier"
              || !importMapping.old.isDefault && specifier.type === "ImportSpecifier" && specifier.imported.name === oldSpecifierName) {
            const newSpecifier = j.importSpecifier(j.identifier(newSpecifierName), specifier.local);
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
  }

  // Add new import declarations, with all the new specifiers we collected.
  root.find(j.Program).forEach((path) => {
    newImports.forEach((specifiers, source) => {
      path.node.body.unshift(j.importDeclaration(specifiers, j.literal(source)));
    });
  });

  return root.toSource();
}

export const parser = 'tsx';

const importMappings = [
  {
    old: { path: "@wasp/config", name: "config", isDefault: true },
    new: { path: "wasp/server", name: "config", isSame: true },
  },
  {
    old: { path: "@wasp/auth/helpers/GitHub", name: "SignInButton" },
    new: { path: "wasp/client/auth", name: "GitHubSignInButton", isSame: false },
  },
  {
    old: { path: "@wasp/auth/helpers/Google", name: "SignInButton" },
    new: { path: "wasp/client/auth", name: "GoogleSignInButton", isSame: false },
  },
  {
    old: { path: "@wasp/auth/forms/types", name: "CustomizationOptions", isType: true },
    new: { path: "wasp/client/auth", name: "CustomizationOptions", isSame: true },
  }
];