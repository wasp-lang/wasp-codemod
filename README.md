# wasp-codemod

## Setup

`npm install`

## Usage

### Updating Wasp 0.11 imports to Wasp 0.12 imports.

Run
`npm run imports-0-11 -- <path-to-your-wasp-project-src-dir>`
to rewrite imports from Wasp version 0.11 to 0.12 in all the .js(x)/.ts(x) files.
This will change files on disk, so make sure that you have a way to restore them
to previous state in case you don't like the changes or something goes wrong
(ideally you have them versioned in .i.e. git).

## Development

### Updating Wasp 0.11 imports to Wasp 0.12 imports.

Run
`npm run imports-0-11:test`
to do a dry run on a test file and print potential modification on stdout.
