import type { Many } from "./utils"

export type XsAnnotation = {
    "xs:documentation"?: string | string[]
}

export type XsSimpleType = {
    "@_name": string
    "xs:annotation"?: Many<XsAnnotation>
    "xs:restriction": {
        "@_base": string
        "xs:minInclusive"?: { "@_value": string | number }
        "xs:totalDigits"?: { "@_value": string | number }
        "xs:fractionDigits"?: { "@_value": string | number }
        "xs:minLength"?: { "@_value": string | number }
        "xs:maxLength"?: { "@_value": string | number }
        "xs:pattern"?: { "@_value": string }
        "xs:enumeration"?: Many<{
            "@_value": string
            "xs:annotation"?: Many<XsAnnotation>
        }>
    }
}

export type XsElement = (
    | { "@_name": string; "@_type": string }
    | { "@_name": string; "xs:complexType": XsNestedElements }
    | { "@_ref": string }
) & {
    "@_minOccurs"?: string | number
    "@_maxOccurs"?: string | number
    "xs:annotation"?: Many<XsAnnotation>
}

export type XsAttribute = {
    "@_name": string
    "@_type"?: string
    "@_use"?: "required"
    "@_fixed"?: string
    "xs:annotation"?: Many<XsAnnotation>
}

export type XsComplexType = {
    "@_name": string
    "xs:annotation"?: Many<XsAnnotation>
} & XsNestedElements

export type XsNestedElements = {
    "xs:attribute"?: Many<XsAttribute>
    "xs:sequence"?: { "xs:element"?: Many<XsElement> }
    "xs:choice"?: { "xs:element"?: Many<XsElement> }
}

export type XsImport = {
    "@_namespace": string
    "@_schemaLocation": string
}

export type XsSchema = {
    "@_targetNamespace": string
    [namespaces: `@_xmlns:${string}`]: string | undefined
    "xs:import"?: Many<XsImport>
    "xs:element"?: Many<XsElement>
    "xs:simpleType"?: Many<XsSimpleType>
    "xs:complexType"?: Many<XsComplexType>
}

export type Xsd = {
    "xs:schema": XsSchema
}
