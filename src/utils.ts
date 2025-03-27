import { XMLParser } from "fast-xml-parser";

export type Awatable<T> = PromiseLike<T> | T;

export type Many<T> = T | readonly T[];

export function asArray<T>(v: Many<T>) {
    return v instanceof Array ? v : [v];
}

type ParseXmlOptions = {
    ignoreAttributes?: boolean;
    preserveNamespaces?: boolean;
};
export function parseXml<T = any>(xml: string, opts?: ParseXmlOptions): T {
    return new XMLParser({
        numberParseOptions: { hex: false, leadingZeros: false },
        trimValues: true,
        ignoreAttributes: !!opts?.ignoreAttributes,
        removeNSPrefix: !opts?.preserveNamespaces,
    }).parse(xml);
}

export function prefixLines(text: string, prefix = "  ") {
    let s = "";
    for (const line of text.split("\n")) {
        s += (s && "\n") + prefix + line;
    }
    return s;
}
