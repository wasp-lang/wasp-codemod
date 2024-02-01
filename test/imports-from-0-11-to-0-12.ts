import { foo, bar } from '@wasp/server';
import { foo as foo2 } from '@wasp/server';
import { test } from '@wasp/test';

console.log(foo + bar + foo2);
console.log(test);