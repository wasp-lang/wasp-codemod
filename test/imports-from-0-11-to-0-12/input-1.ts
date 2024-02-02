// Testing default import, additional unknown named import, and .js extension.
import config, { bar } from "@wasp/config.js";
// Testing import to be renamed, and .tsx extension.
import { SignInButton } from "@wasp/auth/helpers/GitHub.tsx";
// Testing import already aliased to the new name, and no extension.
import { SignInButton as GoogleSignInButton } from "@wasp/auth/helpers/Google";
// Testing `type` import from index.js file.
import { type CustomizationOptions } from "@wasp/auth/forms/types/index.js";
// Testing unknown import from @wasp.
import { foo } from "@wasp/foo";
// Testing unknown import from external package.
import { useState } from "react";

console.log(foo + bar + foo2);
console.log(test);
