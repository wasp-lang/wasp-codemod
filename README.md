# wasp-codemod

This project provides codemods (programs that rewrite your code) for your
Wasp projects, for specific situations.

## Setup

`npm install`

## Usage

### Updating Wasp 0.11 imports to Wasp 0.12 imports.

Run
```
npm run imports-0-11 -- <path-to-your-wasp-project-src-dir>
```
to rewrite imports from Wasp version 0.11 to 0.12 in all the .js(x)/.ts(x) files.
This will change files on disk, so make sure that you have a way to restore them
to previous state in case you don't like the changes or something goes wrong
(ideally you have them versioned in i.e. git).

Example:
```
npm run imports-0-11 -- /home/martin/git/MyWaspProject/src
```

NOTE: The only imports we don't automatically rewrite for you are `crud` imports.
  If you have any of those (they start with `@wasp/crud/`), make sure to rewrite them manually.
  New imports look like `import { NameOfYourCrud } from 'wasp/server/crud'` and
  `import { NameOfYourCrud } from 'wasp/client/crud`.

## For contributors

### Updating Wasp 0.11 imports to Wasp 0.12 imports.

Run
`npm run imports-0-11:test`
to do a dry run on test files in `test/` dir and print modified content of files on output.

There is also an output-* file(s) in `test/` so you can compare manually for expected output -> we don't yet have any automatic comparison set up.
