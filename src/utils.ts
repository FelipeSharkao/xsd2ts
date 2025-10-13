import path from "node:path"
import { XMLParser } from "fast-xml-parser"

export type Awatable<T> = PromiseLike<T> | T

export type Many<T> = T | readonly T[]

export function asArray<T>(v: Many<T>) {
    return v instanceof Array ? v : [v]
}

type ParseXmlOptions = {
    ignoreAttributes?: boolean
    preserveNamespaces?: boolean
}
export function parseXml<T = unknown>(xml: string, opts?: ParseXmlOptions): T {
    // Remove entities
    xml = xml.replace(/<!ENTITY [^>]+>/g, "")
    let o = new XMLParser({
        numberParseOptions: { hex: false, leadingZeros: false },
        trimValues: true,
        ignoreAttributes: !!opts?.ignoreAttributes,
        removeNSPrefix: false,
        processEntities: false,
    }).parse(xml)

    if (!opts?.preserveNamespaces) {
        o = stripXmlNamespaces(o)
    }

    return o
}

export function prefixLines(text: string, prefix = "  ") {
    let s = ""
    for (const line of text.split("\n")) {
        s += (s && "\n") + prefix + line
    }
    return s
}

export function stripXmlNamespaces<T = unknown>(xml: unknown): T {
    if (!xml || typeof xml !== "object") return xml as any

    if (xml instanceof Array) {
        return xml.map((x) => stripXmlNamespaces(x)) as any
    }

    const o: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(xml)) {
        const match = k.match(/^\w+:(.*)+$/)
        if (match?.[1]) {
            o[match[1]] = stripXmlNamespaces(v)
        } else {
            o[k] = stripXmlNamespaces(v)
        }
    }
    return o as any
}

export function cwdFromPath(path_: string) {
    try {
        const url = new URL(path_)
        return url.origin + path.dirname(url.pathname)
    } catch (_) {
        return path.dirname(path_)
    }
}

export async function getFileContent(path_: string) {
    let url: URL | undefined
    try {
        url = new URL(path_)
    } catch (_) {}

    if (url) {
        const res = await fetch(url)
        return res.text()
    } else {
        return Bun.file(path_).text()
    }
}
