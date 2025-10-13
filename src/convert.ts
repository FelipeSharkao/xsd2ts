import path from "node:path"
import { toPascalCase } from "@std/text"
import {
    asArray,
    cwdFromPath,
    getFileContent,
    parseXml,
    prefixLines,
    type Many,
} from "./utils"
import type {
    Xsd,
    XsSchema,
    XsSimpleType,
    XsComplexType,
    XsElement,
    XsAnnotation,
    XsAttribute,
} from "./xsd"

const XS_PRIMITIVE_TYPES: [name: string, tsType: string][] = [
    ["string", "string"],
    ["int", "number | string"],
    ["short", "number | string"],
    ["long", "number | string"],
    ["decimal", "number | string"],
    ["boolean", 'boolean | "true" | "false"'],
    ["base64Binary", "string"],
    ["date", "string"],
    ["dateTime", "string"],
]

export class Context {
    readonly schemas = new Map<string, Schema>()
    readonly stripPrefixes: string[] = []
    attributePrefix = "@_"

    constructor() {
        const xs = new Schema(this, "http://www.w3.org/2001/XMLSchema")
        for (const [name, tsType] of XS_PRIMITIVE_TYPES) {
            xs.addType(new PrimitiveType(this, name, tsType, "Xs"))
        }
        this.schemas.set(xs.namespace, xs)

        const ds = new Schema(this, "http://www.w3.org/2000/09/xmldsig#")
        ds.addType(new PrimitiveType(this, "SignatureType", "unknown"))
        ds.addElement(
            new Element(
                this,
                "Signature",
                new TypeReference(this, ds.namespace, "SignatureType"),
            ),
        )
        this.schemas.set(ds.namespace, ds)
    }

    async loadSchema(path_: string) {
        const cwd = cwdFromPath(path_)

        console.error(`Loading ${path_} (${cwd})`)
        const content = await getFileContent(path_)

        const xsd: Xsd = parseXml(content)
        return Schema.fromXsd(this, xsd["schema"], cwd)
    }

    toTS() {
        let s =
            `/// File generated automatically from XSD\n\n`
            + `type Many<T> = T | readonly T[];\n\n`
            + `type XmlElement = {\n`
            + `  "${this.attributePrefix}xmlns"?: string;\n`
            + `  [ns: \`${this.attributePrefix}xmlns:\${string}\`]: string | undefined;\n`
            + `};\n\n`
            + `type Prolog = { "?xml"?: { "${this.attributePrefix}version": string, "${this.attributePrefix}encoding": string } };`

        for (const schema of this.schemas.values()) {
            const tsSchema = schema.toTS()
            if (!tsSchema) continue
            s += "\n\n" + tsSchema
        }
        return s
    }

    getTSTypeName(name: string) {
        for (const prefix of this.stripPrefixes) {
            if (name.startsWith(prefix)) {
                name = name.slice(prefix.length)
                break
            }
        }
        name = toPascalCase(name)

        return name
    }
}

export class Schema {
    readonly aliasedSchemas = new Map<string, string>()
    readonly elements = new Map<string, Element>()
    readonly types = new Map<string, TypeDefinition>()

    constructor(
        readonly ctx: Context,
        readonly namespace: string,
    ) {}

    static async fromXsd(ctx: Context, node: XsSchema, cwd: string) {
        const namespace = node["@_targetNamespace"]

        let o = ctx.schemas.get(namespace)
        if (!o) {
            o = new Schema(ctx, namespace)
            ctx.schemas.set(namespace, o)
        }

        for (const key in node) {
            if (!key.startsWith("@_xmlns:")) continue
            const nsNamespace = node[key as `@_xmlns:${string}`]!
            const nsAlias = key.slice(8)
            o.aliasedSchemas.set(nsAlias, nsNamespace)
        }

        for (const importNode of asArray(node["import"] ?? [])) {
            if (ctx.schemas.has(importNode["@_namespace"])) continue
            const location = importNode["@_schemaLocation"]
            const path_ =
                location.startsWith("/") || location.match(/^https?:\/\//)
                    ? location
                    : path.join(cwd, location)
            await ctx.loadSchema(path_)
        }

        for (const elementNode of asArray(node["element"] ?? [])) {
            const element = Element.fromXsd(ctx, o, elementNode)
            o.elements.set(element.name, element)
        }

        for (const simpleTypeNode of asArray(node["simpleType"] || [])) {
            o.addType(SimpleType.fromXsd(ctx, o, simpleTypeNode))
        }

        for (const complexTypeNode of asArray(node["complexType"] || [])) {
            o.addType(ComplexType.fromXsd(ctx, o, complexTypeNode))
        }

        return o
    }

    addElement(el: Element) {
        console.error(`Adding element ${el.name}`)
        this.elements.set(el.name, el)
    }

    addType(type: TypeDefinition) {
        console.error(`Adding type ${type.toTSTypeName()} (${type.name})`)
        this.types.set(type.name, type)
    }

    resolveRef(node: string) {
        const parts = node.split(":")

        let name = parts.at(-1)
        let ns = parts.at(-2)
        const namespace = ns ? this.aliasedSchemas.get(ns!) : this.namespace

        if (!name || !namespace || parts.length > 2) return null

        return { namespace, name }
    }

    toTS() {
        let s = ""
        for (const type of this.types.values()) {
            const tsType = type.toTSType()
            if (!tsType) continue
            s += (s && "\n\n") + tsType
        }
        for (const element of this.elements.values()) {
            const tsType = element.toTSType()
            if (!tsType) continue
            s += (s && "\n\n") + tsType
        }
        return s
    }
}

interface TypeDefinition {
    readonly name: string
    toTSType(): string | null
    toTSTypeName(): string
}

export class PrimitiveType implements TypeDefinition {
    constructor(
        readonly ctx: Context,
        readonly name: string,
        readonly tsType: string,
        readonly prefix = "",
    ) {}

    toTSType() {
        return `export type ${this.toTSTypeName()} = ${this.tsType};`
    }

    toTSTypeName() {
        return this.prefix + this.ctx.getTSTypeName(this.name)
    }
}

export class SimpleType implements TypeDefinition {
    annotations?: Annotations
    minInclusive?: number
    totalDigits?: number
    fractionDigits?: number
    minLength?: number
    maxLength?: number
    pattern?: string
    enumeration?: { value: string; annotations?: Annotations }[]

    constructor(
        readonly ctx: Context,
        readonly name: string,
        readonly type: TypeReference,
    ) {}

    static fromXsd(ctx: Context, schema: Schema, node: XsSimpleType) {
        const o = new SimpleType(
            ctx,
            node["@_name"],
            TypeReference.fromXsd(ctx, schema, node["restriction"]["@_base"]),
        )
        if (node["annotation"]) {
            o.annotations = Annotations.fromXsd(node["annotation"])
        }
        if (node["restriction"]["minInclusive"]) {
            o.minInclusive = Number(node["restriction"]["minInclusive"]["@_value"])
        }
        if (node["restriction"]["totalDigits"]) {
            o.totalDigits = Number(node["restriction"]["totalDigits"]["@_value"])
        }
        if (node["restriction"]["fractionDigits"]) {
            o.fractionDigits = Number(node["restriction"]["fractionDigits"]["@_value"])
        }
        if (node["restriction"]["minLength"]) {
            o.minLength = Number(node["restriction"]["minLength"]["@_value"])
        }
        if (node["restriction"]["maxLength"]) {
            o.maxLength = Number(node["restriction"]["maxLength"]["@_value"])
        }
        if (node["restriction"]["pattern"]) {
            o.pattern = node["restriction"]["pattern"]["@_value"]
        }
        const enumeration = asArray(node["restriction"]["enumeration"] ?? []).map((x) => ({
            value: x["@_value"],
            annotations: x["annotation"] && Annotations.fromXsd(x["annotation"]),
        }))
        if (enumeration.length) {
            o.enumeration = enumeration
        }
        return o
    }

    toTSType() {
        let tsType = this?.type?.toTSTypeExpr() || "unknown"
        if (this.enumeration?.length) {
            tsType = ""
            for (const variant of this.enumeration) {
                tsType += (tsType && " | ") + JSON.stringify(variant.value)
                if (variant.value.match(/^\d+(\.\d+)?$/)) {
                    tsType += ` | ${variant.value}`
                }
            }
        }
        let docs = ""
        if (this.annotations) {
            docs += this.annotations.toTSDoc()
        }
        if (this.enumeration?.some((x) => x.annotations?.documentation?.length)) {
            docs += (docs && "\n *\n") + " * Possible values:"
            for (const variant of this.enumeration) {
                docs += `\n * - ${variant.value}: ${variant.annotations?.documentation[0] || ""}`
                for (const line of variant.annotations?.documentation.slice(1) ?? []) {
                    docs += ` * ${" ".repeat(variant.value.length + 3)} ${line}`
                }
            }
        }
        if (
            this.minInclusive != null
            || this.totalDigits != null
            || this.fractionDigits != null
            || this.minLength != null
            || this.maxLength != null
            || this.pattern != null
        ) {
            docs += "\n *"
            if (this.minInclusive != null) {
                docs += (docs && "\n") + ` * Min: ${this.minInclusive}`
            }
            if (this.totalDigits != null) {
                docs += (docs && "\n") + ` * Total digits: ${this.totalDigits}`
            }
            if (this.fractionDigits != null) {
                docs += (docs && "\n") + ` * Fraction digits: ${this.fractionDigits}`
            }
            if (this.minLength != null) {
                docs += (docs && "\n") + ` * Min length: ${this.minLength}`
            }
            if (this.maxLength != null) {
                docs += (docs && "\n") + ` * Max length: ${this.maxLength}`
            }
            if (this.pattern != null) {
                docs += (docs && "\n") + ` * Pattern: /${this.pattern.replaceAll("/", "\\/")}/`
            }
        }
        let s = ""
        if (docs) {
            s += `/**\n${docs}\n */\n`
        }
        return s + `export type ${this.toTSTypeName()} = ${tsType};`
    }

    toTSTypeName() {
        return this.ctx.getTSTypeName(this.name)
    }
}

export class TypeReference {
    constructor(
        readonly ctx: Context,
        readonly namespace: string,
        readonly name: string,
    ) {}

    static fromXsd(ctx: Context, schema: Schema, node: string) {
        const ref = schema.resolveRef(node)
        if (!ref) throw new Error(`Invalid type reference: ${node}`)
        return new TypeReference(ctx, ref.namespace, ref.name)
    }

    toTSTypeExpr() {
        return (
            this.ctx.schemas.get(this.namespace)?.types.get(this.name)?.toTSTypeName()
            || "unknown"
        )
    }
}

export class ComplexType implements TypeDefinition {
    annotations?: Annotations
    variants: { elements: Element[] }[] = []
    attributes: Attribute[] = []

    constructor(
        readonly ctx: Context,
        readonly name: string,
    ) {}

    static fromXsd(ctx: Context, schema: Schema, node: XsComplexType) {
        const o = new ComplexType(ctx, node["@_name"])
        if (node["annotation"]) {
            o.annotations = Annotations.fromXsd(node["annotation"])
        }

        const sequence = asArray(node["sequence"]?.["element"] ?? []).map((x) =>
            Element.fromXsd(ctx, schema, x),
        )
        if (sequence.length) {
            o.variants.push({ elements: sequence })
        }

        for (const elementNode of asArray(node["choice"]?.["element"] ?? [])) {
            const element = Element.fromXsd(ctx, schema, elementNode)
            o.variants.push({ elements: [element] })
        }

        for (const attributeNode of asArray(node["attribute"] ?? [])) {
            const attribute = Attribute.fromXsd(ctx, schema, attributeNode)
            o.attributes.push(attribute)
        }

        return o
    }

    toTSTypeExpr() {
        let s = "XmlElement"
        if (this.attributes.length) {
            const attributes = this.attributes.map((x) => x.toTSField()).join("\n")
            s += ` & {\n${prefixLines(attributes)}\n}`
        }
        if (this.variants.length) {
            let body = ""
            for (const variant of this.variants) {
                const fields = variant.elements.map((x) => x.toTSField()).join("\n")
                body += `${body && " | "}{\n${prefixLines(fields)}`

                for (const otherVariant of this.variants) {
                    if (otherVariant === variant) continue

                    for (const otherElement of otherVariant.elements) {
                        body += `\n${prefixLines("")}${otherElement.name}?: undefined;`
                    }
                }

                body += `\n}`
            }
            s += " & " + (this.variants.length > 1 ? `(${body})` : body)
        }
        return s || "unknown"
    }

    toTSType() {
        let s = ""
        if (this.annotations) {
            s += `/**\n${this.annotations?.toTSDoc() || ""}\n */\n`
        }
        return s + `export type ${this.toTSTypeName()} = ${this.toTSTypeExpr()};`
    }

    toTSTypeName() {
        return this.ctx.getTSTypeName(this.name)
    }
}

export class Element {
    annotations?: Annotations
    minOccurs = 0
    maxOccurs = Infinity

    constructor(
        readonly ctx: Context,
        readonly name: string,
        readonly type: TypeReference | ComplexType,
    ) {}

    static fromXsd(ctx: Context, schema: Schema, node: XsElement) {
        let name: string
        let type: TypeReference | ComplexType
        if ("@_ref" in node) {
            const ref = schema.resolveRef(node["@_ref"])
            if (!ref) throw new Error(`Invalid element reference: ${node["@_ref"]}`)

            const el = ctx.schemas.get(ref.namespace)?.elements.get(ref.name)
            if (!el) throw new Error(`Element not found: ${ref.namespace}:${ref.name}`)

            name = el.name
            type = el.type
        } else if ("@_type" in node) {
            name = node["@_name"]
            type = TypeReference.fromXsd(ctx, schema, node["@_type"])
        } else {
            name = node["@_name"]
            type = ComplexType.fromXsd(ctx, schema, { ...node["complexType"], "@_name": name })
        }

        const o = new Element(ctx, name, type)
        if (node["@_minOccurs"]) {
            o.minOccurs = Number(node["@_minOccurs"])
        }
        if (node["@_maxOccurs"] && node["@_maxOccurs"] !== "unbounded") {
            o.maxOccurs = Number(node["@_maxOccurs"])
        }
        if (node["annotation"]) {
            o.annotations = Annotations.fromXsd(node["annotation"])
        }
        return o
    }

    toTSField(omitDocs = false) {
        let tsType = "unknown"
        if (this.type instanceof TypeReference) {
            tsType = this.type.toTSTypeExpr()
        } else if (this.type instanceof ComplexType) {
            tsType = this.type.toTSTypeExpr()
        }
        if (this.maxOccurs > 1) {
            tsType = `Many<${tsType}>`
        }
        let s = ""
        if (this.annotations && !omitDocs) {
            s += `/**\n${this.annotations?.toTSDoc() || ""}\n */\n`
        }
        return s + `${this.name}${this.minOccurs === 0 ? "?" : ""}: ${tsType};`
    }

    toTSType() {
        let s = ""
        if (this.annotations) {
            s += `/**\n${this.annotations?.toTSDoc() || ""}\n */\n`
        }
        return (
            s
            + `export type ${this.toTSTypeName()} = Prolog & {\n${prefixLines(this.toTSField(true))}\n};`
        )
    }

    toTSTypeName() {
        return this.ctx.getTSTypeName(this.name) + "Element"
    }
}

export class Attribute {
    annotations?: Annotations
    fixed?: string

    constructor(
        readonly ctx: Context,
        readonly name: string,
        readonly type: TypeReference | null,
        public required: boolean,
    ) {}

    static fromXsd(ctx: Context, schema: Schema, node: XsAttribute) {
        const type = node["@_type"] ? TypeReference.fromXsd(ctx, schema, node["@_type"]) : null
        const o = new Attribute(ctx, node["@_name"], type, node["@_use"] === "required")
        if (node["@_fixed"]) {
            o.fixed = node["@_fixed"]
        }
        if (node["annotation"]) {
            o.annotations = Annotations.fromXsd(node["annotation"])
        }
        return o
    }

    toTSField() {
        const fieldName = `"${this.ctx.attributePrefix}${this.name}"`
        let tsType = this.type?.toTSTypeExpr() || "string | number"
        if (this.fixed) {
            tsType = JSON.stringify(this.fixed)
            if (this.fixed.match(/^\d+(\.\d+)?$/)) {
                tsType += ` | ${this.fixed}`
            }
        }
        let s = ""
        if (this.annotations) {
            s += `/**\n${this.annotations?.toTSDoc() || ""}\n */\n`
        }
        return s + `${fieldName}${!this.required ? "?" : ""}: ${tsType};`
    }
}

export class Annotations {
    constructor(public documentation: string[]) {}

    static fromXsd(node: Many<XsAnnotation>) {
        return new Annotations(asArray(node).flatMap((x) => x["documentation"] || []))
    }

    toTSDoc(): string {
        return this.documentation.map((x) => prefixLines(x, " * ")).join("\n\n")
    }
}
