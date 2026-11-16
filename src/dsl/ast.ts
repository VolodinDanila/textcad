import type { SourceSpan } from './diagnostics.ts'

export type NodeId = `node-${number}`

export type AstNodeBase = {
    id: NodeId
    span: SourceSpan
}

export type DocumentNode = AstNodeBase & {
    kind: 'document'
    forms: ListNode[]
}

export type ListNode = AstNodeBase & {
    kind: 'list'
    items: ListItemNode[]
}

export type NamedArgumentNode = AstNodeBase & {
    kind: 'namedArgument'
    name: IdentifierNode
    value: ValueNode
}

export type IdentifierNode = AstNodeBase & {
    kind: 'identifier'
    value: string
}

export type StringLiteralNode = AstNodeBase & {
    kind: 'string'
    value: string
}

export type NumberLiteralNode = AstNodeBase & {
    kind: 'number'
    value: number
    raw: string
}

export type QuantityUnit = 'mm' | 'deg'

export type QuantityLiteralNode = AstNodeBase & {
    kind: 'quantity'
    value: number
    unit: QuantityUnit
    raw: string
}

export type BooleanLiteralNode = AstNodeBase & {
    kind: 'boolean'
    value: boolean
}

export type NullLiteralNode = AstNodeBase & {
    kind: 'null'
    value: null
}

export type ScalarNode =
    | IdentifierNode
    | StringLiteralNode
    | NumberLiteralNode
    | QuantityLiteralNode
    | BooleanLiteralNode
    | NullLiteralNode

export type ValueNode = ListNode | ScalarNode

export type ListItemNode = ValueNode | NamedArgumentNode
