import { API, FileInfo, Options, ImportSpecifier } from "jscodeshift";

export const parser = "tsx";

// Updates imports from Wasp 0.11 to Wasp 0.12.
// We go through all the import declarations in the file and for each one we check
// if it matches any of the old 0.11 imports. If it does, we remove the matching
// specifiers/names from the import declaration and add a new import declaration with
// the new 0.12 import path and the matching specifiers.
export default function transformer(fileInfo: FileInfo, api: API, options: Options) {
  if (!([".js", ".ts", ".jsx", ".tsx"].some((ext) => fileInfo.path.endsWith(ext)))) {
    console.log(fileInfo.path + " is not a JS/TS(X) file, skipping.")
    return fileInfo.source;
  }

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

interface ImportMapping {
  old: {
    path: string;
    name: string;
    isDefault?: boolean;
    // isUserDef?: boolean; // TODO: Enable once we know how to handle it.
  };
  new: {
    path: string;
    name: string;  // TODO: Handle case when it is null.
    isType?: boolean;
    // isUserDef?: boolean; // TODO: Enable once we know how to handle it.
  };
}

// NOTE: Old paths must be without any extensions or /index.js or /index.ts suffixes.
const importMappings: ImportMapping[] = [
  {
    old: { path: '@wasp/config.js', name: 'config', isDefault: true },
    new: { path: 'wasp/server', name: 'config' }
  },
  {
    old: {
      path: '@wasp/dbClient.js',
      name: 'prismaClient',
      isDefault: true
    },
    new: { path: 'wasp/server', name: 'prisma' }
  },
  // {
  //   old: { path: '@wasp/utils', name: 'isPrismaError' },
  //   new: { path: null }
  // },
  // {
  //   old: { path: '@wasp/utils', name: 'prismaErrorToHttpError' },
  //   new: { path: null }
  // },
  {
    old: { path: '@wasp/actions', name: 'useAction' },
    new: { path: 'wasp/client/operations', name: 'useAction' }
  },
  {
    old: { path: '@wasp/actions', name: 'OptimisticUpdateDefinition' },
    new: {
      path: 'wasp/client/operations',
      name: 'OptimisticUpdateDefinition',
      isType: true
    }
  },
  // {
  //   old: {
  //     path: '@wasp/actions/<myAction>',
  //     name: 'myAction',
  //     isDefault: true,
  //     isUserDef: true
  //   },
  //   new: {
  //     path: 'wasp/client/operations',
  //     name: 'myAction',
  //     isUserDef: true
  //   }
  // },
  // {
  //   old: { path: '@wasp/actions/types', name: 'MyAction', isUserDef: true },
  //   new: {
  //     path: 'wasp/server/operations',
  //     name: 'MyAction',
  //     isType: true,
  //     isUserDef: true
  //   }
  // },
  {
    old: { path: '@wasp/queryClient', name: 'configureQueryClient' },
    new: { path: 'wasp/client/operations', name: 'configureQueryClient' }
  },
  {
    old: { path: '@wasp/queries', name: 'useQuery' },
    new: { path: 'wasp/client/operations', name: 'useQuery' }
  },
  // {
  //   old: {
  //     path: '@wasp/queries/<myQuery>',
  //     name: 'myQuery',
  //     isDefault: true,
  //     isUserDef: true
  //   },
  //   new: {
  //     path: 'wasp/client/operations',
  //     name: 'myQuery',
  //     isUserDef: true
  //   }
  // },
  // {
  //   old: { path: '@wasp/queries/types', name: 'MyQuery', isUserDef: true },
  //   new: {
  //     path: 'wasp/server/operations',
  //     name: 'MyQuery',
  //     isType: true,
  //     isUserDef: true
  //   }
  // },
  {
    old: { path: '@wasp/api', name: 'api', isDefault: true },
    new: { path: 'wasp/client/api', name: 'api' }
  },
  // {
  //   old: { path: '@wasp/apis/types', name: 'MyApi', isUserDef: true },
  //   new: {
  //     path: 'wasp/server/api',
  //     name: 'MyApi',
  //     isType: true,
  //     isUserDef: true
  //   }
  // },
  {
    old: { path: '@wasp/auth/login', name: 'login', isDefault: true },
    new: { path: 'wasp/client/auth', name: 'login' }
  },
  {
    old: { path: '@wasp/auth/logout', name: 'logout' },
    new: { path: 'wasp/client/auth', name: 'logout' }
  },
  {
    old: { path: '@wasp/auth/signup', name: 'signup', isDefault: true },
    new: { path: 'wasp/client/auth', name: 'signup' }
  },
  {
    old: { path: '@wasp/auth/useAuth', name: 'useAuth', isDefault: true },
    new: { path: 'wasp/client/auth', name: 'useAuth' }
  },
  {
    old: { path: '@wasp/auth/email/actions', name: 'requestPasswordReset' },
    new: { path: 'wasp/client/auth', name: 'requestPasswordReset' }
  },
  {
    old: { path: '@wasp/auth/email/actions', name: 'resetPassword' },
    new: { path: 'wasp/client/auth', name: 'resetPassword' }
  },
  {
    old: { path: '@wasp/auth/email/actions', name: 'verifyEmail' },
    new: { path: 'wasp/client/auth', name: 'verifyEmail' }
  },
  {
    old: { path: '@wasp/auth/email/actions', name: 'login' },
    new: { path: 'wasp/client/auth', name: 'login' }
  },
  {
    old: { path: '@wasp/auth/email/actions', name: 'signup' },
    new: { path: 'wasp/client/auth', name: 'signup' }
  },
  {
    old: {
      path: '@wasp/auth/providers/email/utils.js',
      name: 'createEmailVerificationLink'
    },
    new: { path: 'wasp/server/auth', name: 'createEmailVerificationLink' }
  },
  {
    old: {
      path: '@wasp/auth/providers/email/utils.js',
      name: 'sendEmailVerificationEmail'
    },
    new: { path: 'wasp/server/auth', name: 'sendEmailVerificationEmail' }
  },
  {
    old: { path: '@wasp/types', name: 'GetVerificationEmailContentFn' },
    new: {
      path: 'wasp/server/auth',
      name: 'GetVerificationEmailContentFn',
      isType: true
    }
  },
  {
    old: { path: '@wasp/types', name: 'GetPasswordResetEmailContentFn' },
    new: {
      path: 'wasp/server/auth',
      name: 'GetPasswordResetEmailContentFn',
      isType: true
    }
  },
  {
    old: {
      path: '@wasp/auth/forms/ForgotPassword',
      name: 'ForgotPasswordForm'
    },
    new: { path: 'wasp/client/auth', name: 'ForgotPasswordForm' }
  },
  {
    old: { path: '@wasp/auth/forms/Login', name: 'LoginForm' },
    new: { path: 'wasp/client/auth', name: 'LoginForm' }
  },
  {
    old: {
      path: '@wasp/auth/forms/ResetPassword',
      name: 'ResetPasswordForm'
    },
    new: { path: 'wasp/client/auth', name: 'ResetPasswordForm' }
  },
  {
    old: { path: '@wasp/auth/forms/Signup', name: 'SignupForm' },
    new: { path: 'wasp/client/auth', name: 'SignupForm' }
  },
  {
    old: { path: '@wasp/auth/forms/VerifyEmail', name: 'VerifyEmailForm' },
    new: { path: 'wasp/client/auth', name: 'VerifyEmailForm' }
  },
  {
    old: { path: '@wasp/auth/forms/types', name: 'CustomizationOptions' },
    new: {
      path: 'wasp/client/auth',
      name: 'CustomizationOptions',
      isType: true
    }
  },
  {
    old: { path: '@wasp/auth/helpers/GitHub', name: 'SignInButton' },
    new: { path: 'wasp/client/auth', name: 'GitHubSignInButton' }
  },
  {
    old: { path: '@wasp/auth/helpers/GitHub', name: 'signInUrl' },
    new: { path: 'wasp/client/auth', name: 'gitHubSignInUrl' }
  },
  {
    old: { path: '@wasp/auth/helpers/Google', name: 'SignInButton' },
    new: { path: 'wasp/client/auth', name: 'GoogleSignInButton' }
  },
  {
    old: { path: '@wasp/auth/helpers/Google', name: 'signInUrl' },
    new: { path: 'wasp/client/auth', name: 'googleSignInUrl' }
  },
  {
    old: {
      path: '@wasp/core/AuthError',
      name: 'AuthError',
      isDefault: true
    },
    new: { path: 'wasp/server', name: 'AuthError' }
  },
  {
    old: {
      path: '@wasp/core/HttpError',
      name: 'HttpError',
      isDefault: true
    },
    new: { path: 'wasp/server', name: 'HttpError' }
  },
  {
    old: { path: '@wasp/dbSeed/types.js', name: 'DbSeedFn' },
    new: { path: 'wasp/server', name: 'DbSeedFn', isType: true }
  },
  {
    old: { path: '@wasp/middleware', name: 'MiddlewareConfigFn' },
    new: { path: 'wasp/server', name: 'MiddlewareConfigFn', isType: true }
  },
  {
    old: { path: '@wasp/types', name: 'ServerSetupFn' },
    new: { path: 'wasp/server', name: 'ServerSetupFn', isType: true }
  },
  {
    old: { path: '@wasp/email', name: 'emailSender' },
    new: { path: 'wasp/email', name: 'emailSender' }
  },
  // {
  //   old: { path: '@wasp/crud/<MyCrud>', name: 'GetAllQuery' },
  //   new: {
  //     path: 'wasp/server/crud',
  //     name: 'MyCrud',
  //     isType: true,
  //     isUserDef: true
  //   }
  // },
  // {
  //   old: { path: '@wasp/crud/<MyCrud>', name: 'GetQuery' },
  //   new: {
  //     path: 'wasp/server/crud',
  //     name: 'MyCrud',
  //     isType: true,
  //     isUserDef: true
  //   }
  // },
  // {
  //   old: { path: '@wasp/crud/<MyCrud>', name: 'CreateAction' },
  //   new: {
  //     path: 'wasp/server/crud',
  //     name: 'MyCrud',
  //     isType: true,
  //     isUserDef: true
  //   }
  // },
  // {
  //   old: { path: '@wasp/crud/<MyCrud>', name: 'UpdateAction' },
  //   new: {
  //     path: 'wasp/server/crud',
  //     name: 'MyCrud',
  //     isType: true,
  //     isUserDef: true
  //   }
  // },
  // {
  //   old: { path: '@wasp/crud/<MyCrud>', name: 'DeleteAction' },
  //   new: {
  //     path: 'wasp/server/crud',
  //     name: 'MyCrud',
  //     isType: true,
  //     isUserDef: true
  //   }
  // },
  // {
  //   old: { path: '@wasp/crud/<MyCrud>', name: 'Crud' },
  //   new: { path: 'wasp/client/crud', name: 'MyCrud', isUserDef: true }
  // },
  // {
  //   old: { path: '@wasp/entities', name: 'MyEntity', isUserDef: true },
  //   new: {
  //     path: 'wasp/entities',
  //     name: 'MyEntity',
  //     isType: true,
  //     isUserDef: true
  //   }
  // },
  // {
  //   old: { path: '@wasp/jobs/<MyJob>', name: 'myJob', isUserDef: true },
  //   new: { path: 'wasp/server/jobs', name: 'myJob', isUserDef: true }
  // },
  {
    old: { path: '@wasp/router', name: 'Link' },
    new: { path: 'wasp/client/router', name: 'Link' }
  },
  {
    old: { path: '@wasp/router', name: 'routes' },
    new: { path: 'wasp/client/router', name: 'routes' }
  },
  {
    old: { path: '@wasp/test', name: 'mockServer' },
    new: { path: 'wasp/client/test', name: 'mockServer' }
  },
  {
    old: { path: '@wasp/test', name: 'renderInContext' },
    new: { path: 'wasp/client/test', name: 'renderInContext' }
  },
  {
    old: { path: '@wasp/types', name: 'Application' },
    new: { path: 'express', name: 'Application', isType: true }
  },
  {
    old: { path: '@wasp/types', name: 'Express' },
    new: { path: 'express', name: 'Express', isType: true }
  },
  {
    old: { path: '@wasp/webSocket', name: 'WebSocketDefinition' },
    new: {
      path: 'wasp/server/webSocket',
      name: 'WebSocketDefinition',
      isType: true
    }
  },
  {
    old: { path: '@wasp/webSocket', name: 'WaspSocketData' },
    new: {
      path: 'wasp/server/webSocket',
      name: 'WaspSocketData',
      isType: true
    }
  },
  {
    old: { path: '@wasp/auth', name: 'defineUserSignupFields' },
    new: { path: 'wasp/server/auth', name: 'defineUserSignupFields' }
  },
  {
    old: { path: '@wasp/auth/user', name: 'getEmail' },
    new: { path: 'wasp/auth', name: 'getEmail' }
  },
  {
    old: { path: '@wasp/auth/user', name: 'getUsername' },
    new: { path: 'wasp/auth', name: 'getUsername' }
  },
  {
    old: { path: '@wasp/auth/user', name: 'getFirstProviderUserId' },
    new: { path: 'wasp/auth', name: 'getFirstProviderUserId' }
  },
  {
    old: { path: '@wasp/auth/user', name: 'findUserIdentity' },
    new: { path: 'wasp/auth', name: 'findUserIdentity' }
  },
  {
    old: { path: '@wasp/auth/types', name: 'User' },
    new: { path: 'wasp/auth', name: 'AuthUser', isType: true }
  },
  {
    old: {
      path: '@wasp/auth/validation.js',
      name: 'ensurePasswordIsPresent'
    },
    new: { path: 'wasp/server/auth', name: 'ensurePasswordIsPresent' }
  },
  {
    old: { path: '@wasp/auth/validation.js', name: 'ensureValidPassword' },
    new: { path: 'wasp/server/auth', name: 'ensureValidPassword' }
  },
  {
    old: { path: '@wasp/auth/validation.js', name: 'ensureValidEmail' },
    new: { path: 'wasp/server/auth', name: 'ensureValidEmail' }
  },
  {
    old: { path: '@wasp/auth/validation.js', name: 'ensureValidUsername' },
    new: { path: 'wasp/server/auth', name: 'ensureValidUsername' }
  },
  {
    old: { path: '@wasp/auth/utils.js', name: 'createProviderId' },
    new: { path: 'wasp/server/auth', name: 'createProviderId' }
  },
  {
    old: {
      path: '@wasp/auth/utils.js',
      name: 'sanitizeAndSerializeProviderData'
    },
    new: {
      path: 'wasp/server/auth',
      name: 'sanitizeAndSerializeProviderData'
    }
  },
  {
    old: {
      path: '@wasp/auth/utils.js',
      name: 'updateAuthIdentityProviderData'
    },
    new: {
      path: 'wasp/server/auth',
      name: 'updateAuthIdentityProviderData'
    }
  },
  {
    old: {
      path: '@wasp/auth/utils.js',
      name: 'deserializeAndSanitizeProviderData'
    },
    new: {
      path: 'wasp/server/auth',
      name: 'deserializeAndSanitizeProviderData'
    }
  },
  {
    old: { path: '@wasp/auth/utils.js', name: 'findAuthIdentity' },
    new: { path: 'wasp/server/auth', name: 'findAuthIdentity' }
  },
  {
    old: { path: '@wasp/auth/utils.js', name: 'createUser' },
    new: { path: 'wasp/server/auth', name: 'createUser' }
  },
  {
    old: { path: '@wasp/auth/forms/internal/Form', name: 'FormError' },
    new: { path: 'wasp/client/auth', name: 'FormError' }
  },
  {
    old: { path: '@wasp/auth/forms/internal/Form', name: 'FormInput' },
    new: { path: 'wasp/client/auth', name: 'FormInput' }
  },
  {
    old: { path: '@wasp/auth/forms/internal/Form', name: 'FormItemGroup' },
    new: { path: 'wasp/client/auth', name: 'FormItemGroup' }
  },
  {
    old: { path: '@wasp/auth/forms/internal/Form', name: 'FormLabel' },
    new: { path: 'wasp/client/auth', name: 'FormLabel' }
  }
]