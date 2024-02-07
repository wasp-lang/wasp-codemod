import {
  API,
  FileInfo,
  Options,
  ImportSpecifier,
  ImportDefaultSpecifier,
  ImportNamespaceSpecifier,
} from "jscodeshift";

export const parser = "tsx";

// Updates imports from Wasp 0.11 to Wasp 0.12.
// We go through all the import declarations in the file and for each one we check
// if it matches any of the old 0.11 imports. If it does, we remove the matching
// specifiers/names from the import declaration and add a new import declaration with
// the new 0.12 import path and the matching specifiers.
export default function transformer(fileInfo: FileInfo, api: API, options: Options): string {
  // Skip rewriting any non JS/TS files.
  if (![".js", ".ts", ".jsx", ".tsx"].some((ext) => fileInfo.path.endsWith(ext))) {
    return fileInfo.source;
  }

  const j = api.jscodeshift;
  const astRoot = j(fileInfo.source);

  // These are the new imports that we will add to the file.
  // We collect them here as we analyze the file, then at the end we write them to file.
  // We use the function below, `addImportToNewImports`, to add them to this map.
  // Key is the new import path, value is an array of specifiers (names) to import from that path.
  let newImports: Map<string, ImportSpecifier[]> = new Map();

  // Adds given import (path + name) to `newImports` map.
  // @param source - new import path.
  // @param specifier - new import specifier (name).
  function addImportToNewImports(source: string, specifier: ImportSpecifier): void {
    const existingSpecifiers = newImports.get(source);
    if (existingSpecifiers) {
      existingSpecifiers.push(specifier);
    } else {
      newImports.set(source, [specifier]);
    }
  }

  // Import mappings are defined at the bottom of the file: they define how old imports
  // map to new imports, how are they to be rewritten.
  // For each import mapping, we check if any of the imports in the file (in its AST) match it,
  // and if they do, we remove these old imports from file (its AST) and add new versions of
  // them to `newImports` map.
  for (const importMapping of importMappings) {
    astRoot.find(j.ImportDeclaration).forEach((astPath) => {
      // True if import declaration we are observing has 'type' in front of `{ ... }`,
      // e.g. `import type { Foo, Bar } from "foo/bar"`.
      const isImportDeclarationATypeImport = astPath.value.importKind === "type";

      // Check if the import path matches the old import path of the import mapping.
      // If it doesn't, skip this import declaration.
      const importPathsMatch =
        typeof astPath.value.source.value == "string" &&
        tryMatchingImportPathToImportMappingOldPath(astPath.value.source.value, importMapping);
      if (!importPathsMatch) {
        return;
      }

      // User defined part of the import path, if it matched on a regex.
      // Example: if import path is `@wasp/actions/<someAction>`, this will be `someAction`.
      // Example: if import path is `@wasp/config`, this will be `null`.
      const userDefImportPathName = typeof importPathsMatch === "string" ? importPathsMatch : null;

      // Names (specifiers) that observed import declaration imports.
      const importSpecifiers = astPath.value.specifiers;
      if (!importSpecifiers) return;

      let matchingImportSpecifiers: typeof importSpecifiers = [];
      let nonMatchingImportSpecifiers: typeof importSpecifiers = [];

      // Split import specifiers into those that match the old import name
      // from importMapping and those that don't.
      // Those that don't match we will leave be as they are.
      // Those that match we are going to rewrite (this will usually be one or none,
      // but we treat it as plural just in case).
      for (const importSpecifier of importSpecifiers) {
        const areBothDefault =
          importMapping.old.name === defaultName &&
          importSpecifier.type === "ImportDefaultSpecifier";

        const areBothNamed =
          importMapping.old.name !== defaultName && importSpecifier.type === "ImportSpecifier";

        const doTheyMatch =
          areBothDefault ||
          (areBothNamed &&
            // If we are expecting a user defined name, then any import name will match.
            (importMapping.old.name === userDefName ||
              // Otherwise, they have to match exactly.
              importMapping.old.name === importSpecifier.imported.name));

        if (doTheyMatch) {
          matchingImportSpecifiers.push(importSpecifier);
        } else {
          nonMatchingImportSpecifiers.push(importSpecifier);
        }
      }

      // Update observed import declaration in the AST to have only non-matching specifiers,
      // or remove it if there are no non-matching specifiers left.
      if (nonMatchingImportSpecifiers.length) {
        astPath.value.specifiers = nonMatchingImportSpecifiers;
      } else {
        j(astPath).remove();
      }

      // Time to do actual import mapping: determine new import specifiers (if any)
      // for the matching old import specifiers, based on the import mapping,
      // and add them to the `newImports`.
      if (importMapping.new === null) {
        const commentLine = j.commentLine(
          " TODO: Removed " +
            matchingImportSpecifiers.map((s) => "`" + getImportSpecifierName(s) + "`").join(", ") +
            ' from "' +
            importMapping.old.path +
            '" import because it is deprecated and has no clear alternative. Please check migration instructions in Wasp docs on how to manually migrate the code that was using it.',
        );

        astRoot.find(j.Program).forEach((path) => {
          path.node.comments = path.node.comments || [];
          path.node.comments.push(commentLine);
        });
      } else if (importMapping.new !== null) {
        for (const oldImportSpecifier of matchingImportSpecifiers) {
          const newName: string = (() => {
            // If new import name is fixed, use it.
            if (typeof importMapping.new.name === "string") {
              return importMapping.new.name;
            }
            // If new import name is user defined, that means we need to figure
            // it out from a user defined part of the old import, which can be either
            // part of the old import path, or an old import name / specifier.
            // We give precedence to the old import name.
            if (importMapping.new.name === userDefName) {
              if (
                importMapping.old.name === userDefName &&
                oldImportSpecifier.type === "ImportSpecifier"
              ) {
                return oldImportSpecifier.imported.name;
              }
              if (userDefImportPathName) {
                return userDefImportPathName;
              }
              throw new Error("I don't know how to determine name for new import.");
            }
            throw new Error("This should never happen.");
          })();

          const newSpecifier = j.importSpecifier(j.identifier(newName), oldImportSpecifier.local);

          // We determine if new specifier (import name) is `type` based on the old import name (specifier):
          // if old imported name was a type, new one is also. Unless, in the importMapping, it is
          // explicitly stated that the new import name is or is not a type, in that case we use that.
          if (
            importMapping.new.isType !== false &&
            (isImportDeclarationATypeImport ||
              // @ts-expect-error https://github.com/benjamn/ast-types/pull/725 .
              oldImportSpecifier.importKind === "type" ||
              importMapping.new.isType === true)
          ) {
            // @ts-expect-error https://github.com/benjamn/ast-types/pull/725 .
            newSpecifier.importKind = "type";
          }

          addImportToNewImports(importMapping.new.path, newSpecifier);
        }
      }
    });
  }

  // Add new import declarations to the AST, with all the new specifiers we collected in `newImports`.
  astRoot.find(j.Program).forEach((path) => {
    newImports.forEach((specifiers, source) => {
      path.node.body.unshift(j.importDeclaration(specifiers, j.literal(source)));
    });
  });

  return astRoot.toSource();
}

function getImportSpecifierName(
  specifier: ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier,
): string {
  switch (specifier.type) {
    case "ImportSpecifier":
      return specifier.imported.name;
    case "ImportDefaultSpecifier":
      return specifier.local?.name ?? "default";
    case "ImportNamespaceSpecifier":
      return specifier.local?.name ?? "namespace";
  }
}

// Returns a string in case when old import path is regex and it matched the given import path.
// Then, returned string is the value of the capturing group from the regex.
// Tries to match the given import path to the old import path of the given import mapping,
// in the sense that it can and should be rewritten using the import mapping.
//
// Returns false if there is no match. true if there is a match, and string if there is a match
// If there is a match and the old import path is a regex, it returns a string
// which is the value of the first capturing group from the regex.
// Otherwise, if it is a match but old import path is not a regex, it returns just true.
function tryMatchingImportPathToImportMappingOldPath(
  importPath: string,
  importMapping: ImportMapping,
): boolean | string {
  const validSuffixes = ["", ".js", ".jsx", ".ts", ".tsx", "/index.js", "/index.ts"];
  if (importMapping.old.path instanceof RegExp) {
    const validPathRegexes = [];
    for (const suffix of validSuffixes) {
      validPathRegexes.push(new RegExp(importMapping.old.path.source + escapeRegExp(suffix)));
    }
    const matchingPathRegex = validPathRegexes.find((regex) => regex.test(importPath));
    if (matchingPathRegex) {
      const match = importPath.match(matchingPathRegex);
      if (match) return match[1];
    }
    return false;
  } else {
    const validPaths = validSuffixes.map((suffix) => importMapping.old.path + suffix);
    return validPaths.includes(importPath);
  }
}

// Turns a string into a regex that matches that string exactly (escaping any special chars).
function escapeRegExp(x: string): string {
  // Copied from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions .
  return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

// Used to mark the import name as a default import.
const defaultName = Symbol("default");
// Used to mark the import name as a non-default import name that is user defined.
const userDefName = Symbol("userDefName");

// Old import name can be:
// - string: named import of known, fixed name, e.g. `config` in `{ config } from '@wasp/config';`
// - defaultName: default import, any name, e.g. `config` in `import config from '@wasp/config';`
// - userDefName: named import whose name is defined by user,
//     e.g. `myAction` in `{ someAction } from '@wasp/actions/someAction';`
type OldImportName = string | typeof userDefName | typeof defaultName;
// New import name is of almost the same type as old import name, except it can't be default name.
type NewImportName = string | typeof userDefName;

interface ImportMapping {
  old: {
    // NOTE: Old paths must be without any extensions like .js(x)/.ts(x)
    // or /index.js or /index.ts suffixes.
    // NOTE: All regexes are expected to have a single capturing group that
    // captures the user defined part of the import path. Don't use regex
    // if there is no user defined part of the import path.
    path: string | RegExp;
    name: OldImportName;
  };
  new: null | {
    path: string;
    name: NewImportName;
    isType?: boolean;
  };
}

const importMappings: ImportMapping[] = [
  {
    old: { path: "@wasp/config", name: defaultName },
    new: { path: "wasp/server", name: "config" },
  },
  {
    old: { path: "@wasp/dbClient", name: defaultName },
    new: { path: "wasp/server", name: "prisma" },
  },
  {
    old: { path: "@wasp/utils", name: "isPrismaError" },
    new: null,
  },
  {
    old: { path: "@wasp/utils", name: "prismaErrorToHttpError" },
    new: null,
  },
  {
    old: { path: "@wasp/auth", name: "defineAdditionalSignupFields" },
    new: { path: "wasp/server/auth", name: "defineUserSignupFields" },
  },
  {
    old: { path: "@wasp/types", name: "GetUserFieldsFn" },
    new: null,
  },
  {
    old: { path: "@wasp/core/auth", name: "generateAvailableDictionaryUsername" },
    new: null,
  },
  {
    old: { path: "@wasp/core/auth", name: "generateAvailableUsername" },
    new: null,
  },
  {
    old: { path: "@wasp/actions", name: "useAction" },
    new: { path: "wasp/client/operations", name: "useAction" },
  },
  {
    old: { path: "@wasp/actions", name: "OptimisticUpdateDefinition" },
    new: { path: "wasp/client/operations", name: "OptimisticUpdateDefinition", isType: true },
  },
  {
    old: { path: /@wasp\/actions\/(\w+)/, name: defaultName },
    new: { path: "wasp/client/operations", name: userDefName },
  },
  {
    old: { path: "@wasp/actions/types", name: userDefName },
    new: { path: "wasp/server/operations", name: userDefName, isType: true },
  },
  {
    old: { path: "@wasp/queryClient", name: "configureQueryClient" },
    new: { path: "wasp/client/operations", name: "configureQueryClient" },
  },
  {
    old: { path: "@wasp/queries", name: "useQuery" },
    new: { path: "wasp/client/operations", name: "useQuery" },
  },
  {
    old: { path: /@wasp\/queries\/(\w+)/, name: defaultName },
    new: { path: "wasp/client/operations", name: userDefName },
  },
  {
    old: { path: "@wasp/queries/types", name: userDefName },
    new: { path: "wasp/server/operations", name: userDefName, isType: true },
  },
  {
    old: { path: "@wasp/api", name: defaultName },
    new: { path: "wasp/client/api", name: "api" },
  },
  {
    old: { path: "@wasp/apis/types", name: userDefName },
    new: { path: "wasp/server/api", name: userDefName, isType: true },
  },
  {
    old: { path: "@wasp/auth/login", name: defaultName },
    new: { path: "wasp/client/auth", name: "login" },
  },
  {
    old: { path: "@wasp/auth/logout", name: defaultName },
    new: { path: "wasp/client/auth", name: "logout" },
  },
  {
    old: { path: "@wasp/auth/signup", name: defaultName },
    new: { path: "wasp/client/auth", name: "signup" },
  },
  {
    old: { path: "@wasp/auth/useAuth", name: defaultName },
    new: { path: "wasp/client/auth", name: "useAuth" },
  },
  {
    old: { path: "@wasp/auth/email/actions", name: "requestPasswordReset" },
    new: { path: "wasp/client/auth", name: "requestPasswordReset" },
  },
  {
    old: { path: "@wasp/auth/email/actions", name: "resetPassword" },
    new: { path: "wasp/client/auth", name: "resetPassword" },
  },
  {
    old: { path: "@wasp/auth/email/actions", name: "verifyEmail" },
    new: { path: "wasp/client/auth", name: "verifyEmail" },
  },
  {
    old: { path: "@wasp/auth/email/actions", name: "login" },
    new: { path: "wasp/client/auth", name: "login" },
  },
  {
    old: { path: "@wasp/auth/email/actions", name: "signup" },
    new: { path: "wasp/client/auth", name: "signup" },
  },
  {
    old: { path: "@wasp/auth/providers/email/utils", name: "createEmailVerificationLink" },
    new: { path: "wasp/server/auth", name: "createEmailVerificationLink" },
  },
  {
    old: { path: "@wasp/auth/providers/email/utils", name: "sendEmailVerificationEmail" },
    new: { path: "wasp/server/auth", name: "sendEmailVerificationEmail" },
  },
  {
    old: { path: "@wasp/types", name: "GetVerificationEmailContentFn" },
    new: { path: "wasp/server/auth", name: "GetVerificationEmailContentFn", isType: true },
  },
  {
    old: { path: "@wasp/types", name: "GetPasswordResetEmailContentFn" },
    new: { path: "wasp/server/auth", name: "GetPasswordResetEmailContentFn", isType: true },
  },
  {
    old: { path: "@wasp/auth/forms/ForgotPassword", name: "ForgotPasswordForm" },
    new: { path: "wasp/client/auth", name: "ForgotPasswordForm" },
  },
  {
    old: { path: "@wasp/auth/forms/Login", name: "LoginForm" },
    new: { path: "wasp/client/auth", name: "LoginForm" },
  },
  {
    old: { path: "@wasp/auth/forms/ResetPassword", name: "ResetPasswordForm" },
    new: { path: "wasp/client/auth", name: "ResetPasswordForm" },
  },
  {
    old: { path: "@wasp/auth/forms/Signup", name: "SignupForm" },
    new: { path: "wasp/client/auth", name: "SignupForm" },
  },
  {
    old: { path: "@wasp/auth/forms/VerifyEmail", name: "VerifyEmailForm" },
    new: { path: "wasp/client/auth", name: "VerifyEmailForm" },
  },
  {
    old: { path: "@wasp/auth/forms/types", name: "CustomizationOptions" },
    new: { path: "wasp/client/auth", name: "CustomizationOptions", isType: true },
  },
  {
    old: { path: "@wasp/auth/helpers/GitHub", name: "SignInButton" },
    new: { path: "wasp/client/auth", name: "GitHubSignInButton" },
  },
  {
    old: { path: "@wasp/auth/helpers/GitHub", name: "signInUrl" },
    new: { path: "wasp/client/auth", name: "gitHubSignInUrl" },
  },
  {
    old: { path: "@wasp/auth/helpers/Google", name: "SignInButton" },
    new: { path: "wasp/client/auth", name: "GoogleSignInButton" },
  },
  {
    old: { path: "@wasp/auth/helpers/Google", name: "signInUrl" },
    new: { path: "wasp/client/auth", name: "googleSignInUrl" },
  },
  {
    old: { path: "@wasp/core/AuthError", name: defaultName },
    new: { path: "wasp/server", name: "AuthError" },
  },
  {
    old: { path: "@wasp/core/HttpError", name: defaultName },
    new: { path: "wasp/server", name: "HttpError" },
  },
  {
    old: { path: "@wasp/dbSeed/types", name: "DbSeedFn" },
    new: { path: "wasp/server", name: "DbSeedFn", isType: true },
  },
  {
    old: { path: "@wasp/middleware", name: "MiddlewareConfigFn" },
    new: { path: "wasp/server", name: "MiddlewareConfigFn", isType: true },
  },
  {
    old: { path: "@wasp/types", name: "ServerSetupFn" },
    new: { path: "wasp/server", name: "ServerSetupFn", isType: true },
  },
  {
    old: { path: "@wasp/email", name: "emailSender" },
    new: { path: "wasp/email", name: "emailSender" },
  },
  {
    old: { path: "@wasp/entities", name: userDefName },
    new: { path: "wasp/entities", name: userDefName, isType: true },
  },
  {
    old: { path: /@wasp\/jobs\/(\w+)/, name: userDefName },
    new: { path: "wasp/server/jobs", name: userDefName },
  },
  {
    old: { path: "@wasp/router", name: "Link" },
    new: { path: "wasp/client/router", name: "Link" },
  },
  {
    old: { path: "@wasp/router", name: "routes" },
    new: { path: "wasp/client/router", name: "routes" },
  },
  {
    old: { path: "@wasp/test", name: "mockServer" },
    new: { path: "wasp/client/test", name: "mockServer" },
  },
  {
    old: { path: "@wasp/test", name: "renderInContext" },
    new: { path: "wasp/client/test", name: "renderInContext" },
  },
  {
    old: { path: "@wasp/types", name: "Application" },
    new: { path: "express", name: "Application", isType: true },
  },
  {
    old: { path: "@wasp/types", name: "Express" },
    new: { path: "express", name: "Express", isType: true },
  },
  {
    old: { path: "@wasp/webSocket", name: "ServerToClientPayload" },
    new: { path: "wasp/client/webSocket", name: "ServerToClientPayload", isType: true },
  },
  {
    old: { path: "@wasp/webSocket", name: "ClientToServerPayload" },
    new: { path: "wasp/client/webSocket", name: "ClientToServerPayload", isType: true },
  },
  {
    old: { path: "@wasp/webSocket", name: "useSocket" },
    new: { path: "wasp/client/webSocket", name: "useSocket" },
  },
  {
    old: { path: "@wasp/webSocket", name: "useSocketListener" },
    new: { path: "wasp/client/webSocket", name: "useSocketListener" },
  },
  {
    old: { path: "@wasp/webSocket", name: "WebSocketDefinition" },
    new: { path: "wasp/server/webSocket", name: "WebSocketDefinition", isType: true },
  },
  {
    old: { path: "@wasp/webSocket", name: "WaspSocketData" },
    new: { path: "wasp/server/webSocket", name: "WaspSocketData", isType: true },
  },
  {
    old: { path: "@wasp/auth", name: "defineUserSignupFields" },
    new: { path: "wasp/server/auth", name: "defineUserSignupFields" },
  },
  {
    old: { path: "@wasp/auth/user", name: "getEmail" },
    new: { path: "wasp/auth", name: "getEmail" },
  },
  {
    old: { path: "@wasp/auth/user", name: "getUsername" },
    new: { path: "wasp/auth", name: "getUsername" },
  },
  {
    old: { path: "@wasp/auth/user", name: "getFirstProviderUserId" },
    new: { path: "wasp/auth", name: "getFirstProviderUserId" },
  },
  {
    old: { path: "@wasp/auth/user", name: "findUserIdentity" },
    new: { path: "wasp/auth", name: "findUserIdentity" },
  },
  {
    old: { path: "@wasp/auth/types", name: "User" },
    new: { path: "wasp/auth", name: "AuthUser", isType: true },
  },
  {
    old: { path: "@wasp/auth/validation", name: "ensurePasswordIsPresent" },
    new: { path: "wasp/server/auth", name: "ensurePasswordIsPresent" },
  },
  {
    old: { path: "@wasp/auth/validation", name: "ensureValidPassword" },
    new: { path: "wasp/server/auth", name: "ensureValidPassword" },
  },
  {
    old: { path: "@wasp/auth/validation", name: "ensureValidEmail" },
    new: { path: "wasp/server/auth", name: "ensureValidEmail" },
  },
  {
    old: { path: "@wasp/auth/validation", name: "ensureValidUsername" },
    new: { path: "wasp/server/auth", name: "ensureValidUsername" },
  },
  {
    old: { path: "@wasp/auth/utils", name: "createProviderId" },
    new: { path: "wasp/server/auth", name: "createProviderId" },
  },
  {
    old: { path: "@wasp/auth/utils", name: "sanitizeAndSerializeProviderData" },
    new: { path: "wasp/server/auth", name: "sanitizeAndSerializeProviderData" },
  },
  {
    old: { path: "@wasp/auth/utils", name: "updateAuthIdentityProviderData" },
    new: { path: "wasp/server/auth", name: "updateAuthIdentityProviderData" },
  },
  {
    old: { path: "@wasp/auth/utils", name: "deserializeAndSanitizeProviderData" },
    new: { path: "wasp/server/auth", name: "deserializeAndSanitizeProviderData" },
  },
  {
    old: { path: "@wasp/auth/utils", name: "findAuthIdentity" },
    new: { path: "wasp/server/auth", name: "findAuthIdentity" },
  },
  {
    old: { path: "@wasp/auth/utils", name: "createUser" },
    new: { path: "wasp/server/auth", name: "createUser" },
  },
  {
    old: { path: "@wasp/auth/forms/internal/Form", name: "FormError" },
    new: { path: "wasp/client/auth", name: "FormError" },
  },
  {
    old: { path: "@wasp/auth/forms/internal/Form", name: "FormInput" },
    new: { path: "wasp/client/auth", name: "FormInput" },
  },
  {
    old: { path: "@wasp/auth/forms/internal/Form", name: "FormItemGroup" },
    new: { path: "wasp/client/auth", name: "FormItemGroup" },
  },
  {
    old: { path: "@wasp/auth/forms/internal/Form", name: "FormLabel" },
    new: { path: "wasp/client/auth", name: "FormLabel" },
  },
];
