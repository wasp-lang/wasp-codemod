import { run as jscodeshift } from "jscodeshift/src/Runner";
import path from "node:path";

async function main() {
  const transformPath = path.resolve("src/transforms/imports-from-0-11-to-0-12.ts");

  let args = process.argv.slice(2);

  let isTest = false;
  if (args.length > 0 && args[0] === "--test") {
    isTest = true;
    args = args.slice(1);
  }

  const paths = args;

  const options = {
    dry: isTest,
    print: isTest,
    verbose: 0,
    // ...
  };

  const res = await jscodeshift(transformPath, paths, options);
}

main();
