import type {
    AstNodeBase,
    BooleanLiteralNode,
    DocumentNode,
    IdentifierNode,
    ListItemNode,
    ListNode,
    NamedArgumentNode,
    NodeId,
    NullLiteralNode,
    NumberLiteralNode,
    QuantityLiteralNode,
    QuantityUnit,
    StringLiteralNode,
    ValueNode,
} from './ast.ts'
import {
    createParseDiagnostic,
    type Diagnostic,
    type SourcePosition,
    type SourceSpan,
} from './diagnostics.ts'

type TokenKind =
    | 'leftBracket'
    | 'rightBracket'
    | 'equals'
    | 'identifier'
    | 'string'
    | 'number'
    | 'quantity'
    | 'boolean'
    | 'null'
    | 'invalid'
    | 'eof'

type Token = {
    kind: TokenKind
    text: string
    value?: string | number | boolean | null
    unit?: QuantityUnit
    span: SourceSpan
}

export type ParseOptions = {
    revisionId?: number
}

export type ParseResult = {
    document: DocumentNode
    diagnostics: Diagnostic[]
}

const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/
const QUANTITY_PATTERN = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(mm|deg)$/
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/

function clonePosition(position: SourcePosition): SourcePosition {
    return { ...position }
}

function mergeSpans(start: SourceSpan, end: SourceSpan): SourceSpan {
    return {
        start: clonePosition(start.start),
        end: clonePosition(end.end),
    }
}

class Scanner {
    private readonly source: string
    private readonly revisionId: number
    private readonly diagnostics: Diagnostic[]
    private offset = 0
    private line = 1
    private column = 1

    constructor(source: string, revisionId: number, diagnostics: Diagnostic[]) {
        this.source = source
        this.revisionId = revisionId
        this.diagnostics = diagnostics
    }

    scan(): Token[] {
        const tokens: Token[] = []

        while (!this.isAtEnd()) {
            this.skipTrivia()

            if (this.isAtEnd()) {
                break
            }

            const start = this.position()
            const character = this.peek()

            if (character === '[') {
                this.advance()
                tokens.push(this.token('leftBracket', '[', start))
                continue
            }

            if (character === ']') {
                this.advance()
                tokens.push(this.token('rightBracket', ']', start))
                continue
            }

            if (character === '=') {
                this.advance()
                tokens.push(this.token('equals', '=', start))
                continue
            }

            if (character === '"') {
                tokens.push(this.scanString())
                continue
            }

            tokens.push(this.scanAtom())
        }

        const end = this.position()
        tokens.push({
            kind: 'eof',
            text: '',
            span: { start: end, end: clonePosition(end) },
        })

        return tokens
    }

    private scanString(): Token {
        const start = this.position()
        let value = ''
        this.advance()

        while (!this.isAtEnd() && this.peek() !== '"') {
            if (this.peek() !== '\\') {
                value += this.advance()
                continue
            }

            const escapeStart = this.position()
            this.advance()

            if (this.isAtEnd()) {
                break
            }

            const escaped = this.advance()
            const escapeValues: Record<string, string> = {
                '"': '"',
                '\\': '\\',
                n: '\n',
                r: '\r',
                t: '\t',
            }

            if (escaped in escapeValues) {
                value += escapeValues[escaped]
            } else {
                const span = { start: escapeStart, end: this.position() }
                this.diagnostics.push(createParseDiagnostic(
                    'TCD-P002',
                    `Unknown escape sequence "\\${escaped}".`,
                    span,
                    this.revisionId,
                ))
                value += escaped
            }
        }

        if (this.isAtEnd()) {
            const span = { start, end: this.position() }
            this.diagnostics.push(createParseDiagnostic(
                'TCD-P003',
                'Unterminated string literal.',
                span,
                this.revisionId,
            ))
        } else {
            this.advance()
        }

        return {
            kind: 'string',
            text: this.source.slice(start.offset, this.offset),
            value,
            span: { start, end: this.position() },
        }
    }

    private scanAtom(): Token {
        const start = this.position()

        while (!this.isAtEnd()) {
            const character = this.peek()
            if (/\s/.test(character) || character === '[' || character === ']' || character === '=' || character === ';') {
                break
            }
            this.advance()
        }

        if (start.offset === this.offset) {
            const unexpected = this.advance()
            const span = { start, end: this.position() }
            this.diagnostics.push(createParseDiagnostic(
                'TCD-P002',
                `Unexpected character "${unexpected}".`,
                span,
                this.revisionId,
            ))
            return { kind: 'invalid', text: unexpected, span }
        }

        const text = this.source.slice(start.offset, this.offset)
        const span = { start, end: this.position() }

        if (text === 'true' || text === 'false') {
            return { kind: 'boolean', text, value: text === 'true', span }
        }

        if (text === 'null') {
            return { kind: 'null', text, value: null, span }
        }

        const quantity = text.match(QUANTITY_PATTERN)
        if (quantity) {
            return {
                kind: 'quantity',
                text,
                value: Number(quantity[1]),
                unit: quantity[2] as QuantityUnit,
                span,
            }
        }

        if (NUMBER_PATTERN.test(text)) {
            return { kind: 'number', text, value: Number(text), span }
        }

        if (IDENTIFIER_PATTERN.test(text)) {
            return { kind: 'identifier', text, value: text, span }
        }

        const looksNumeric = /^[+\-.\d]/.test(text)
        const code = looksNumeric ? 'TCD-P004' : 'TCD-P002'
        const message = looksNumeric
            ? `Invalid number or quantity "${text}".`
            : `Invalid token "${text}".`
        this.diagnostics.push(createParseDiagnostic(code, message, span, this.revisionId))
        return { kind: 'invalid', text, span }
    }

    private skipTrivia() {
        while (!this.isAtEnd()) {
            if (/\s/.test(this.peek())) {
                this.advance()
                continue
            }

            if (this.peek() === ';') {
                while (!this.isAtEnd() && this.peek() !== '\n') {
                    this.advance()
                }
                continue
            }

            break
        }
    }

    private token(kind: TokenKind, text: string, start: SourcePosition): Token {
        return {
            kind,
            text,
            span: { start, end: this.position() },
        }
    }

    private position(): SourcePosition {
        return { offset: this.offset, line: this.line, column: this.column }
    }

    private peek(): string {
        return this.source[this.offset]
    }

    private advance(): string {
        const character = this.source[this.offset]
        this.offset += 1

        if (character === '\n') {
            this.line += 1
            this.column = 1
        } else {
            this.column += 1
        }

        return character
    }

    private isAtEnd(): boolean {
        return this.offset >= this.source.length
    }
}

class Parser {
    private readonly tokens: Token[]
    private readonly revisionId: number
    private readonly diagnostics: Diagnostic[]
    private current = 0
    private nextNodeId = 1

    constructor(tokens: Token[], revisionId: number, diagnostics: Diagnostic[]) {
        this.tokens = tokens
        this.revisionId = revisionId
        this.diagnostics = diagnostics
    }

    parseDocument(): DocumentNode {
        const forms: ListNode[] = []
        const start = clonePosition(this.peek().span.start)

        while (!this.check('eof')) {
            if (this.check('leftBracket')) {
                forms.push(this.parseList())
                continue
            }

            const token = this.advance()
            this.reportUnexpected(token, 'Expected a form enclosed in square brackets.')
        }

        return {
            id: this.createNodeId(),
            kind: 'document',
            forms,
            span: {
                start,
                end: clonePosition(this.peek().span.end),
            },
        }
    }

    private parseList(): ListNode {
        const opening = this.advance()
        const items: ListItemNode[] = []

        while (!this.check('rightBracket') && !this.check('eof')) {
            const item = this.parseListItem()
            if (item) {
                items.push(item)
            }
        }

        if (this.check('rightBracket')) {
            const closing = this.advance()
            return {
                id: this.createNodeId(),
                kind: 'list',
                items,
                span: mergeSpans(opening.span, closing.span),
            }
        }

        const span = {
            start: clonePosition(opening.span.start),
            end: clonePosition(this.peek().span.end),
        }
        this.diagnostics.push(createParseDiagnostic(
            'TCD-P001',
            'Unclosed square bracket.',
            span,
            this.revisionId,
        ))

        return {
            id: this.createNodeId(),
            kind: 'list',
            items,
            span,
        }
    }

    private parseListItem(): ListItemNode | null {
        if (this.check('identifier') && this.peekNext().kind === 'equals') {
            return this.parseNamedArgument()
        }

        return this.parseValue()
    }

    private parseNamedArgument(): NamedArgumentNode | null {
        const nameToken = this.advance()
        const name = this.identifierNode(nameToken)
        this.advance()

        if (this.check('rightBracket') || this.check('eof')) {
            this.diagnostics.push(createParseDiagnostic(
                'TCD-P002',
                `Expected a value for named argument "${name.value}".`,
                this.peek().span,
                this.revisionId,
            ))
            return null
        }

        const value = this.parseValue()
        if (!value) {
            return null
        }

        return {
            id: this.createNodeId(),
            kind: 'namedArgument',
            name,
            value,
            span: mergeSpans(name.span, value.span),
        }
    }

    private parseValue(): ValueNode | null {
        if (this.check('leftBracket')) {
            return this.parseList()
        }

        const token = this.advance()
        const base = this.nodeBase(token.span)

        switch (token.kind) {
            case 'identifier':
                return { ...base, kind: 'identifier', value: String(token.value) }
            case 'string':
                return { ...base, kind: 'string', value: String(token.value) }
            case 'number':
                return { ...base, kind: 'number', value: Number(token.value), raw: token.text }
            case 'quantity':
                return {
                    ...base,
                    kind: 'quantity',
                    value: Number(token.value),
                    unit: token.unit as QuantityUnit,
                    raw: token.text,
                }
            case 'boolean':
                return { ...base, kind: 'boolean', value: Boolean(token.value) }
            case 'null':
                return { ...base, kind: 'null', value: null }
            case 'invalid':
                return null
            default:
                this.reportUnexpected(token, `Unexpected token "${token.text}".`)
                return null
        }
    }

    private identifierNode(token: Token): IdentifierNode {
        return {
            ...this.nodeBase(token.span),
            kind: 'identifier',
            value: String(token.value),
        }
    }

    private nodeBase(span: SourceSpan): AstNodeBase {
        return {
            id: this.createNodeId(),
            span,
        }
    }

    private createNodeId(): NodeId {
        const id: NodeId = `node-${this.nextNodeId}`
        this.nextNodeId += 1
        return id
    }

    private reportUnexpected(token: Token, message: string) {
        if (token.kind === 'invalid') {
            return
        }

        this.diagnostics.push(createParseDiagnostic(
            'TCD-P002',
            message,
            token.span,
            this.revisionId,
        ))
    }

    private check(kind: TokenKind): boolean {
        return this.peek().kind === kind
    }

    private peek(): Token {
        return this.tokens[this.current]
    }

    private peekNext(): Token {
        return this.tokens[Math.min(this.current + 1, this.tokens.length - 1)]
    }

    private advance(): Token {
        const token = this.peek()
        if (token.kind !== 'eof') {
            this.current += 1
        }
        return token
    }
}

export function parseTextCad(source: string, options: ParseOptions = {}): ParseResult {
    const revisionId = options.revisionId ?? 0
    const diagnostics: Diagnostic[] = []
    const scanner = new Scanner(source, revisionId, diagnostics)
    const tokens = scanner.scan()
    const parser = new Parser(tokens, revisionId, diagnostics)

    return {
        document: parser.parseDocument(),
        diagnostics,
    }
}

export type {
    BooleanLiteralNode,
    NullLiteralNode,
    NumberLiteralNode,
    QuantityLiteralNode,
    StringLiteralNode,
}
