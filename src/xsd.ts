import type { Many } from "./utils"

export type XsAnnotation = {
    documentation?: string | string[]
}

export type XsSimpleType = {
    "@_name": string
    annotation?: Many<XsAnnotation>
    restriction: {
        "@_base": string
        minInclusive?: { "@_value": string | number }
        totalDigits?: { "@_value": string | number }
        fractionDigits?: { "@_value": string | number }
        minLength?: { "@_value": string | number }
        maxLength?: { "@_value": string | number }
        pattern?: { "@_value": string }
        enumeration?: Many<{
            "@_value": string
            annotation?: Many<XsAnnotation>
        }>
    }
}

export type XsElement = (
    | { "@_name": string; "@_type": string }
    | { "@_name": string; complexType: XsNestedElements }
    | { "@_ref": string }
) & {
    "@_minOccurs"?: string | number
    "@_maxOccurs"?: string | number
    annotation?: Many<XsAnnotation>
}

export type XsAttribute = {
    "@_name": string
    "@_type"?: string
    "@_use"?: "required"
    "@_fixed"?: string
    annotation?: Many<XsAnnotation>
}

export type XsComplexType = {
    "@_name": string
    annotation?: Many<XsAnnotation>
} & XsNestedElements

export type XsNestedElements = {
    attribute?: Many<XsAttribute>
    sequence?: XsNestedElementsBase
    choice?: XsChoice
}

export type XsNestedElementsBase = {
    element?: Many<XsElement>
    sequence?: XsNestedElementsBase
    choice?: XsChoice
}

export type XsChoice = {
    "@_minOccurs"?: string | number
    "@_maxOccurs"?: string | number
} & XsNestedElementsBase

export type XsImport = {
    "@_namespace": string
    "@_schemaLocation": string
}

export type XsSchema = {
    "@_targetNamespace": string
    [namespaces: `@_xmlns:${string}`]: string | undefined
    import?: Many<XsImport>
    element?: Many<XsElement>
    simpleType?: Many<XsSimpleType>
    complexType?: Many<XsComplexType>
}

export type Xsd = {
    schema: XsSchema
}
