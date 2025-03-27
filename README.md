# xsd2ts

Convert XSD to TS types.

Just call `bun run start <path to files> > output.ts`. It will generate a file that export
a type for every type and element defined in the XSD files. It was designed to work aout
of the box with [fast-xml-parser](https://www.npmjs.com/package/fast-xml-parser).

## Options

 - `--strip-prefix`, `-p`: remove a certain prefix from the beginning of types. Can be
     passed multiple times to handle multiple prefix.
 - `--attribute-prefix`, `-a`: specifies the prefix for fields that represents attributes.
     Defaults to `@_`, as in fast-xml-parser.

## Disclaimer

This project was created and will be updated as needed for my day job. I didn't bother
implementing the whole XSD spec, and edge cases are probably not handled.

## Is it any good?

Yes.
