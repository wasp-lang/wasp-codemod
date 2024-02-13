// Testing default import, additional unknown named import, and .js extension.
import config, { bar } from "@wasp/config.js";
// Testing import to be renamed, and .tsx extension.
import { SignInButton } from "@wasp/auth/helpers/GitHub.tsx";
// Testing import already aliased to the new name, and no extension.
import { SignInButton as GoogleSignInButton } from "@wasp/auth/helpers/Google";
// Testing `type` import from index.js file.
import { type CustomizationOptions } from "@wasp/auth/forms/types/index.js";
// Testing imports that should get removed (deprecated).
import { prismaErrorToHttpError, isPrismaError } from "@wasp/utils";
// Testing imports with user defined stuff.
import doSomething from "@wasp/actions/doSomething";
import { type DoSomething } from "@wasp/actions/types";
import getSomethingPliz from "@wasp/queries/getSomething";
import { type GetSomething as GetSomethingType } from "@wasp/queries/types";
import { type BestApiEver, type OneMoreApi } from "@wasp/apis/types";
import { type SomeEntity, type AnotherEntity } from "@wasp/entities";
import { superCoolJob } from "@wasp/jobs/superCoolJob";
import { amazingJob } from "@wasp/jobs/amazingJob";
import { type AmazingJob } from "@wasp/jobs/amazingJob";
import type { AmazingJob2 } from "@wasp/jobs/amazingJob2";
// Testing unknown import from @wasp.
import { foo } from "@wasp/foo";
// Testing import from @wasp that has known path but uknown specifier.
import { sleep } from "@wasp/utils";
// Testing unknown import from external package.
import { useState } from "react";

console.log(foo + bar + foo2);
console.log(test);
