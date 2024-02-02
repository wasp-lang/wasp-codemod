import {
  type CustomizationOptions,
  GoogleSignInButton,
  GitHubSignInButton as SignInButton,
} from "wasp/client/auth";

import { config } from "wasp/server";
// Testing default import, additional unknown named import, and .js extension.
import { bar } from "@wasp/config.js";
// Testing unknown import from @wasp.
import { foo } from "@wasp/foo";
// Testing unknown import from external package.
import { useState } from "react";

console.log(foo + bar + foo2);
console.log(test);