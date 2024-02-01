import { run as jscodeshift } from 'jscodeshift/src/Runner';
import path from 'node:path';

async function main () {
  const transformPath = path.resolve('src/transforms/imports-from-0-11-to-0-12.ts')
  const paths = ['test/imports-from-0-11-to-0-12.ts']
  // const transformPath = path.resolve('src/transforms/foo-to-bar.ts')
  // const paths = ['test/foo-to-bar.js']
  const options = {
    dry: true,
    print: true,
    verbose: 1,
    // ...
  }

  const res = await jscodeshift(transformPath, paths, options)
  console.log(res)
  /*
    {
    stats: {},
    timeElapsed: '0.001',
    error: 0,
    ok: 0,
    nochange: 0,
    skip: 0
    }
  */
}

main();
