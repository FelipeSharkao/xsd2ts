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
            substitution: { type: "string", short: "s", multiple: true },
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

    for (const substitution of values["substitution"] ?? []) {
        const parts = substitution.split("=")
        if (parts.length !== 2) throw new Error(`Invalid type substitution: ${substitution}`)

        const [from, to] = parts as [string, string]

        const toParts = to.split("#")
        if (toParts.length < 1 || toParts.length > 2)
            throw new Error(`Invalid type substitution: ${substitution}`)

        const tsType = toParts.at(-1)!
        const importPath = toParts.at(-2)

        let module
        if (importPath) {
            module = ctx.importedModules.get(importPath)
            if (!module) {
                const n = ctx.importedModules.size
                module = { name: `_m${n}`, imports: [] }
                ctx.importedModules.set(importPath, module)
            }
            module.imports.push(tsType)
        }

        ctx.substitutions.set(from, { module: module?.name, type: tsType })
    }

    for (const path of positionals) {
        await ctx.loadSchema(path)
    }

    const ts = ctx.toTS()
    console.log(ts)
}
