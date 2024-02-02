import { API, FileInfo, Options, ImportSpecifier } from "jscodeshift";

// We go through all the import declarations in the file and for each one we check
// if it matches any of the old import paths. If it does, we remove the matching
// specifiers from the import declaration and add a new import declaration with
// the new import path and the matching specifiers.
export default function transformer(fileInfo: FileInfo, api: API, options: Options) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  // Key is the new import path, value is an array of specifiers to import from that path.
  let newImports: Map<string, ImportSpecifier[]> = new Map();

  function addImportToNewImports(source: string, specifier: ImportSpecifier) {
    const existingSpecifiers = newImports.get(source);
    if (existingSpecifiers) {
      existingSpecifiers.push(specifier);
    } else {
      newImports.set(source, [specifier]);
    }
  }

  for (const importMapping of importMappings) {
    // TODO:
    // What about special cases? Like user def? Or paths with variable parts?
    // Or that case where it maps to null? Handle these special cases.
    // I also want to write a nice test file.
    // And I need to add real mappings down there.
    // - Get the whole program to run for all files in their project.

    function doesAnImportPathMatchOldImportPath(importPath: string) {
      const validPaths = ["", ".js", ".jsx", ".ts", ".tsx", "/index.js", "/index.ts"].map(
        (suffix) => importMapping.old.path + suffix,
      );
      return validPaths.includes(importPath);
    }

    root
      .find(j.ImportDeclaration)
      .filter((astPath) => {
        return (
          typeof astPath.value.source.value == "string" &&
          doesAnImportPathMatchOldImportPath(astPath.value.source.value)
        );
      })
      .forEach((astPath) => {
        const importSpecifiers = astPath.value.specifiers;
        if (!importSpecifiers) return;

        let matchingImportSpecifiers: typeof importSpecifiers = [];
        let nonMatchingImportSpecifiers: typeof importSpecifiers = [];

        // Split import specifiers into those that match the old import name
        // and those that don't.
        importSpecifiers.forEach((importSpecifier) => {
          const doesAnImportSpecifierMatchOldImportName: boolean =
            (importMapping.old.isDefault && importSpecifier.type === "ImportDefaultSpecifier") ||
            (!importMapping.old.isDefault &&
              importSpecifier.type === "ImportSpecifier" &&
              importSpecifier.imported.name === importMapping.old.name);
          if (doesAnImportSpecifierMatchOldImportName) {
            matchingImportSpecifiers.push(importSpecifier);
          } else {
            nonMatchingImportSpecifiers.push(importSpecifier);
          }
        });

        // Update import declaration to have only non-matching specifiers,
        // or remove it if there are no non-matching specifiers left.
        if (nonMatchingImportSpecifiers.length) {
          astPath.value.specifiers = nonMatchingImportSpecifiers;
        } else {
          j(astPath).remove();
        }

        // Determine new import specifiers for matching old import specifiers
        // and add them to `newImports`.
        matchingImportSpecifiers.forEach((importSpecifier) => {
          const newSpecifier = j.importSpecifier(
            j.identifier(importMapping.new.name),
            importSpecifier.local,
          );
          if (importMapping.new.isType) {
            // @ts-expect-error https://github.com/benjamn/ast-types/pull/725 .
            newSpecifier.importKind = "type";
          }
          addImportToNewImports(importMapping.new.path, newSpecifier);
        });
      });
  }

  // Add new import declarations, with all the new specifiers we collected in `newImports`.
  root.find(j.Program).forEach((path) => {
    newImports.forEach((specifiers, source) => {
      path.node.body.unshift(j.importDeclaration(specifiers, j.literal(source)));
    });
  });

  return root.toSource();
}

export const parser = "tsx";

interface ImportMapping {
  old: {
    path: string;
    name: string;
    isDefault?: boolean;
  };
  new: {
    path: string;
    name: string;
    isType?: boolean;
  };
}

// NOTE: Old paths must be without any extensions or /index.js or /index.ts suffixes.
const importMappings: ImportMapping[] = [
  {
    old: { path: "@wasp/config", name: "config", isDefault: true },
    new: { path: "wasp/server", name: "config" },
  },
  {
    old: { path: "@wasp/auth/helpers/GitHub", name: "SignInButton" },
    new: { path: "wasp/client/auth", name: "GitHubSignInButton" },
  },
  {
    old: { path: "@wasp/auth/helpers/Google", name: "SignInButton" },
    new: { path: "wasp/client/auth", name: "GoogleSignInButton" },
  },
  {
    old: { path: "@wasp/auth/forms/types", name: "CustomizationOptions" },
    new: { path: "wasp/client/auth", name: "CustomizationOptions", isType: true },
  },
];
