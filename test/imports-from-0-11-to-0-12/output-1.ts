import { superCoolJob, amazingJob, type AmazingJob, type AmazingJob2 } from "wasp/server/jobs";
import { type SomeEntity, type AnotherEntity } from "wasp/entities";

import {
  type CustomizationOptions,
  GitHubSignInButton as SignInButton,
  GoogleSignInButton,
} from "wasp/client/auth";

import { type BestApiEver, type OneMoreApi } from "wasp/server/api";
import { type DoSomething, type GetSomething as GetSomethingType } from "wasp/server/operations";
import { doSomething, getSomething as getSomethingPliz } from "wasp/client/operations";
import { config } from "wasp/server";
// Testing default import, additional unknown named import, and .js extension.
import { bar } from "@wasp/config.js";
// Testing unknown import from @wasp.
import { foo } from "@wasp/foo";
// Testing unknown import from external package.
import { useState } from "react";

console.log(foo + bar + foo2);
console.log(test);
