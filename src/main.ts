import { parseArgs } from "node:util"
import { Context } from "./convert"

main().then(
    () => {
        process.exit()
    },
    (err) => {
        console.error(err)
        process.exit(1)
    },
)

async function main() {
    const { values, positionals } = parseArgs({
        options: {
            "strip-prefix": { type: "string", short: "p", multiple: true },
            "attribute-prefix": { type: "string", short: "a" },
        },
        allowPositionals: true,
    })

    const ctx = new Context()

    for (const prefix of values["strip-prefix"] ?? []) {
        ctx.stripPrefixes.push(prefix)
    }

    if (values["attribute-prefix"]) {
        ctx.attributePrefix = values["attribute-prefix"]
    }

    for (const path of positionals) {
        await ctx.loadSchema(path)
    }

    const ts = ctx.toTS()
    console.log(ts)
}
