import type {
    BooleanLiteralNode,
    DocumentNode,
    IdentifierNode,
    ListNode,
    NamedArgumentNode,
    NodeId,
    NumberLiteralNode,
    QuantityLiteralNode,
    QuantityUnit,
    StringLiteralNode,
    ValueNode,
} from './ast.ts'
import {
    createSemanticDiagnostic,
    type Diagnostic,
    type SourceSpan,
} from './diagnostics.ts'

export type SemanticType = 'number' | 'length' | 'angle' | 'sketch' | 'solid' | 'unknown'

export type SemanticHeader = {
    version: 1
    defaultLength: 'mm'
    defaultAngle: 'deg'
    sourceId: NodeId
}

export type ScalarLiteral = {
    kind: 'scalarLiteral'
    value: number
    unit: QuantityUnit | null
    sourceId: NodeId
    span: SourceSpan
}

export type ParameterReference = {
    kind: 'parameterReference'
    name: string
    sourceId: NodeId
    span: SourceSpan
}

export type LengthExpression = ScalarLiteral | ParameterReference

export type Point2Expression = {
    kind: 'point2'
    values: [LengthExpression, LengthExpression]
    sourceId: NodeId
    span: SourceSpan
}

export type Point3Expression = {
    kind: 'point3'
    values: [LengthExpression, LengthExpression, LengthExpression]
    sourceId: NodeId
    span: SourceSpan
}

export type LineExpression = {
    kind: 'line'
    start: Point2Expression
    end: Point2Expression
    sourceId: NodeId
    span: SourceSpan
}

export type ArcExpression = {
    kind: 'arc'
    start: Point2Expression
    middle: Point2Expression
    end: Point2Expression
    sourceId: NodeId
    span: SourceSpan
}

export type CircleExpression = {
    kind: 'circle'
    center: Point2Expression
    radius: LengthExpression
    sourceId: NodeId
    span: SourceSpan
}

export type CurveExpression = LineExpression | ArcExpression | CircleExpression

export type ProfileExpression = {
    kind: 'profile'
    role: 'outer' | 'hole'
    curves: CurveExpression[]
    sourceId: NodeId
    span: SourceSpan
}

export type SketchExpression = {
    kind: 'sketch'
    plane: 'XY' | 'XZ' | 'YZ'
    origin?: Point3Expression
    profiles: ProfileExpression[]
    sourceId: NodeId
    span: SourceSpan
}

export type ExtrudeExpression = {
    kind: 'extrude'
    profile: string
    length: LengthExpression
    symmetric: boolean
    sourceId: NodeId
    span: SourceSpan
}

export type SolidReference = {
    kind: 'solidReference'
    name: string
    sourceId: NodeId
    span: SourceSpan
}

export type BooleanExpression = {
    kind: 'union' | 'cut' | 'intersect'
    operands: SolidOperand[]
    sourceId: NodeId
    span: SourceSpan
}

export type SolidExpression = ExtrudeExpression | BooleanExpression
export type SolidOperand = SolidReference | SolidExpression
export type FeatureExpression = SketchExpression | SolidExpression

export type SemanticParameter = {
    name: string
    value: ScalarLiteral
    valueType: 'number' | 'length' | 'angle'
    sourceId: NodeId
    span: SourceSpan
}

export type SemanticBinding = {
    name: string
    expression: FeatureExpression
    valueType: 'sketch' | 'solid'
    sourceId: NodeId
    span: SourceSpan
}

export type SemanticRoot = {
    reference: string
    label: string | null
    sourceId: NodeId
    span: SourceSpan
}

export type SemanticProgram = {
    header: SemanticHeader | null
    parameters: SemanticParameter[]
    bindings: SemanticBinding[]
    roots: SemanticRoot[]
}

export type SemanticOptions = {
    revisionId?: number
}

export type SemanticResult = {
    program: SemanticProgram
    diagnostics: Diagnostic[]
}

type Arguments = {
    positional: ValueNode[]
    named: Map<string, NamedArgumentNode>
}

type SymbolInfo = {
    name: string
    type: SemanticType
    span: SourceSpan
}

const TOP_LEVEL_COMMANDS = new Set(['textcad', 'param', 'let', 'root'])
const EXPRESSION_COMMANDS = new Set([
    'sketch', 'profile', 'line', 'arc', 'circle', 'extrude', 'union', 'cut', 'intersect',
])
const KNOWN_COMMANDS = new Set([...TOP_LEVEL_COMMANDS, ...EXPRESSION_COMMANDS])

class SemanticAnalyzer {
    private readonly document: DocumentNode
    private readonly revisionId: number
    private readonly diagnostics: Diagnostic[] = []
    private readonly symbols = new Map<string, SymbolInfo>()
    private readonly declarationIndexes = new Map<string, number[]>()
    private header: SemanticHeader | null = null

    constructor(document: DocumentNode, revisionId: number) {
        this.document = document
        this.revisionId = revisionId
    }

    analyze(): SemanticResult {
        const program: SemanticProgram = {
            header: null,
            parameters: [],
            bindings: [],
            roots: [],
        }

        this.indexDeclarations()

        let firstBodyForm = 0
        const firstForm = this.document.forms[0]
        if (firstForm && this.commandName(firstForm)?.value === 'textcad') {
            this.header = this.analyzeHeader(firstForm)
            program.header = this.header
            firstBodyForm = 1
        } else {
            this.report(
                'TCD-S004',
                'The document must start with a textcad header.',
                firstForm?.span ?? this.document.span,
            )
        }

        for (let index = firstBodyForm; index < this.document.forms.length; index += 1) {
            const form = this.document.forms[index]
            const command = this.commandName(form)

            if (!command) {
                this.report('TCD-S001', 'Expected a command name at the start of the form.', form.span)
                continue
            }

            switch (command.value) {
                case 'param': {
                    const parameter = this.analyzeParameter(form, index)
                    if (parameter) {
                        program.parameters.push(parameter)
                    }
                    break
                }
                case 'let': {
                    const binding = this.analyzeBinding(form, index)
                    if (binding) {
                        program.bindings.push(binding)
                    }
                    break
                }
                case 'root': {
                    const root = this.analyzeRoot(form, index)
                    if (root) {
                        program.roots.push(root)
                    }
                    break
                }
                case 'textcad':
                    this.report('TCD-S006', 'The textcad header is only allowed as the first form.', form.span)
                    break
                default:
                    if (KNOWN_COMMANDS.has(command.value)) {
                        this.report(
                            'TCD-S006',
                            `Command "${command.value}" is not allowed at the top level.`,
                            command.span,
                        )
                    } else {
                        this.report('TCD-S001', `Unknown command "${command.value}".`, command.span)
                    }
            }
        }

        if (program.roots.length === 0) {
            this.report('TCD-S008', 'The document must publish at least one root.', this.document.span)
        }

        return { program, diagnostics: this.diagnostics }
    }

    private indexDeclarations() {
        this.document.forms.forEach((form, index) => {
            const command = this.commandName(form)?.value
            if (command !== 'param' && command !== 'let') {
                return
            }

            const name = form.items[1]
            if (name?.kind !== 'identifier') {
                return
            }

            const indexes = this.declarationIndexes.get(name.value) ?? []
            indexes.push(index)
            this.declarationIndexes.set(name.value, indexes)
        })
    }

    private analyzeHeader(form: ListNode): SemanticHeader | null {
        const args = this.collectArguments(form, ['version', 'default-length', 'default-angle'])
        this.rejectPositionalArguments(args, form, 'textcad')

        const version = this.requiredNamed(args, 'version', form)
        const defaultLength = this.requiredNamed(args, 'default-length', form)
        const defaultAngle = this.requiredNamed(args, 'default-angle', form)
        let valid = true

        if (version && (version.kind !== 'number' || !Number.isInteger(version.value) || version.value !== 1)) {
            this.typeError(version, 'version must be the integer 1.')
            valid = false
        }

        if (defaultLength && (defaultLength.kind !== 'identifier' || defaultLength.value !== 'mm')) {
            this.typeError(defaultLength, 'default-length must be mm in DSL v0.')
            valid = false
        }

        if (defaultAngle && (defaultAngle.kind !== 'identifier' || defaultAngle.value !== 'deg')) {
            this.typeError(defaultAngle, 'default-angle must be deg in DSL v0.')
            valid = false
        }

        if (!version || !defaultLength || !defaultAngle) {
            valid = false
        }

        return valid
            ? { version: 1, defaultLength: 'mm', defaultAngle: 'deg', sourceId: form.id }
            : null
    }

    private analyzeParameter(form: ListNode, formIndex: number): SemanticParameter | null {
        const args = this.collectArguments(form, [])
        if (!this.expectPositionalCount(args, form, 'param', 2)) {
            return null
        }

        const name = this.expectIdentifier(args.positional[0], 'Parameter name must be an identifier.')
        const scalar = this.scalarLiteral(args.positional[1])
        if (!name || !scalar) {
            return null
        }

        const valueType = scalar.unit === 'mm'
            ? 'length'
            : scalar.unit === 'deg'
                ? 'angle'
                : 'number'

        if (!this.declareSymbol(name, valueType, formIndex)) {
            return null
        }

        return {
            name: name.value,
            value: scalar,
            valueType,
            sourceId: form.id,
            span: form.span,
        }
    }

    private analyzeBinding(form: ListNode, formIndex: number): SemanticBinding | null {
        const args = this.collectArguments(form, [])
        if (!this.expectPositionalCount(args, form, 'let', 2)) {
            return null
        }

        const name = this.expectIdentifier(args.positional[0], 'Binding name must be an identifier.')
        const expressionNode = args.positional[1]
        if (!name || expressionNode.kind !== 'list') {
            if (expressionNode.kind !== 'list') {
                this.typeError(expressionNode, 'let expects a command form as its value.')
            }
            return null
        }

        const expression = this.analyzeFeatureExpression(expressionNode, formIndex)
        const valueType = expression?.kind === 'sketch'
            ? 'sketch'
            : expression
                ? 'solid'
                : 'unknown'

        if (!this.declareSymbol(name, valueType, formIndex) || !expression || valueType === 'unknown') {
            return null
        }

        return {
            name: name.value,
            expression,
            valueType,
            sourceId: form.id,
            span: form.span,
        }
    }

    private analyzeRoot(form: ListNode, formIndex: number): SemanticRoot | null {
        const args = this.collectArguments(form, ['label'])
        if (!this.expectPositionalCount(args, form, 'root', 1)) {
            return null
        }

        const reference = this.expectIdentifier(args.positional[0], 'root expects a binding reference.')
        const labelValue = args.named.get('label')?.value
        let label: string | null = null

        if (labelValue) {
            if (labelValue.kind !== 'string') {
                this.typeError(labelValue, 'root label must be a string.')
            } else {
                label = labelValue.value
            }
        }

        if (!reference || !this.resolveReference(reference, formIndex, ['solid'], 'root')) {
            return null
        }

        return {
            reference: reference.value,
            label,
            sourceId: form.id,
            span: form.span,
        }
    }

    private analyzeFeatureExpression(form: ListNode, formIndex: number): FeatureExpression | null {
        const command = this.commandName(form)
        if (!command) {
            this.report('TCD-S001', 'Expected a command name at the start of the expression.', form.span)
            return null
        }

        switch (command.value) {
            case 'sketch':
                return this.analyzeSketch(form, formIndex)
            case 'extrude':
                return this.analyzeExtrude(form, formIndex)
            case 'union':
            case 'cut':
            case 'intersect':
                return this.analyzeBoolean(form, formIndex, command.value)
            default:
                if (KNOWN_COMMANDS.has(command.value)) {
                    this.report(
                        'TCD-S006',
                        `Command "${command.value}" does not produce a value accepted by let.`,
                        command.span,
                    )
                } else {
                    this.report('TCD-S001', `Unknown command "${command.value}".`, command.span)
                }
                return null
        }
    }

    private analyzeSketch(form: ListNode, formIndex: number): SketchExpression | null {
        const args = this.collectArguments(form, ['plane', 'origin'])
        const planeValue = this.requiredNamed(args, 'plane', form)
        const originValue = args.named.get('origin')?.value
        const origin = originValue ? this.point3(originValue, formIndex) : undefined
        let plane: SketchExpression['plane'] | null = null

        if (planeValue) {
            if (planeValue.kind === 'identifier' && ['XY', 'XZ', 'YZ'].includes(planeValue.value)) {
                plane = planeValue.value as SketchExpression['plane']
            } else {
                this.typeError(planeValue, 'sketch plane must be XY, XZ or YZ.')
            }
        }

        const profiles: ProfileExpression[] = []
        for (const child of args.positional) {
            if (child.kind !== 'list') {
                this.typeError(child, 'sketch only accepts profile child forms.')
                continue
            }

            const command = this.commandName(child)
            if (command?.value !== 'profile') {
                if (command && !KNOWN_COMMANDS.has(command.value)) {
                    this.report('TCD-S001', `Unknown command "${command.value}".`, command.span)
                } else {
                    this.report('TCD-S006', 'sketch only accepts profile child forms.', child.span)
                }
                continue
            }

            const profile = this.analyzeProfile(child, formIndex)
            if (profile) {
                profiles.push(profile)
            }
        }

        if (profiles.length === 0) {
            this.report('TCD-S004', 'sketch requires at least one profile.', form.span)
        } else if (!profiles.some(({ role }) => role === 'outer')) {
            this.report('TCD-S004', 'sketch requires at least one outer profile.', form.span)
        }

        return plane && profiles.length > 0
            ? { kind: 'sketch', plane, origin: origin ?? undefined, profiles, sourceId: form.id, span: form.span }
            : null
    }

    private analyzeBoolean(
        form: ListNode,
        formIndex: number,
        kind: BooleanExpression['kind'],
    ): BooleanExpression | null {
        const args = this.collectArguments(form, [])
        if (args.positional.length < 2 || args.positional.length > 32) {
            this.report(
                args.positional.length < 2 ? 'TCD-S004' : 'TCD-S006',
                `${kind} requires between 2 and 32 solid operands.`,
                form.span,
            )
            return null
        }

        const operands: SolidOperand[] = []
        for (const value of args.positional) {
            if (value.kind === 'identifier') {
                if (this.resolveReference(value, formIndex, ['solid'], kind)) {
                    operands.push({
                        kind: 'solidReference', name: value.value, sourceId: value.id, span: value.span,
                    })
                }
            } else if (value.kind === 'list') {
                const expression = this.analyzeFeatureExpression(value, formIndex)
                if (expression?.kind === 'sketch') {
                    this.typeError(value, `${kind} expects a solid, not a sketch.`)
                } else if (expression) {
                    operands.push(expression)
                }
            } else {
                this.typeError(value, `${kind} expects a solid reference or a solid operation.`)
            }
        }

        return operands.length === args.positional.length
            ? { kind, operands, sourceId: form.id, span: form.span }
            : null
    }

    private analyzeProfile(form: ListNode, formIndex: number): ProfileExpression | null {
        const args = this.collectArguments(form, ['role'])
        const roleValue = args.named.get('role')?.value
        let role: ProfileExpression['role'] = 'outer'

        if (roleValue) {
            if (roleValue.kind === 'identifier' && (roleValue.value === 'outer' || roleValue.value === 'hole')) {
                role = roleValue.value
            } else {
                this.typeError(roleValue, 'profile role must be outer or hole.')
            }
        }

        const curves: CurveExpression[] = []
        for (const child of args.positional) {
            if (child.kind !== 'list') {
                this.typeError(child, 'profile only accepts curve child forms.')
                continue
            }

            const curve = this.analyzeCurve(child, formIndex)
            if (curve) {
                curves.push(curve)
            }
        }

        if (curves.length === 0) {
            this.report('TCD-S004', 'profile requires at least one curve.', form.span)
            return null
        }

        return { kind: 'profile', role, curves, sourceId: form.id, span: form.span }
    }

    private analyzeCurve(form: ListNode, formIndex: number): CurveExpression | null {
        const command = this.commandName(form)
        if (!command) {
            this.report('TCD-S001', 'Expected a curve command.', form.span)
            return null
        }

        switch (command.value) {
            case 'line':
                return this.analyzeLine(form, formIndex)
            case 'arc':
                return this.analyzeArc(form, formIndex)
            case 'circle':
                return this.analyzeCircle(form, formIndex)
            default:
                if (KNOWN_COMMANDS.has(command.value)) {
                    this.report('TCD-S006', `Command "${command.value}" is not a curve.`, command.span)
                } else {
                    this.report('TCD-S001', `Unknown command "${command.value}".`, command.span)
                }
                return null
        }
    }

    private analyzeLine(form: ListNode, formIndex: number): LineExpression | null {
        const args = this.collectArguments(form, ['start', 'end'])
        this.rejectPositionalArguments(args, form, 'line')
        const startValue = this.requiredNamed(args, 'start', form)
        const endValue = this.requiredNamed(args, 'end', form)
        const start = startValue ? this.point2(startValue, formIndex) : null
        const end = endValue ? this.point2(endValue, formIndex) : null

        return start && end
            ? { kind: 'line', start, end, sourceId: form.id, span: form.span }
            : null
    }

    private analyzeArc(form: ListNode, formIndex: number): ArcExpression | null {
        const args = this.collectArguments(form, ['start', 'middle', 'end'])
        this.rejectPositionalArguments(args, form, 'arc')
        const startValue = this.requiredNamed(args, 'start', form)
        const middleValue = this.requiredNamed(args, 'middle', form)
        const endValue = this.requiredNamed(args, 'end', form)
        const start = startValue ? this.point2(startValue, formIndex) : null
        const middle = middleValue ? this.point2(middleValue, formIndex) : null
        const end = endValue ? this.point2(endValue, formIndex) : null

        return start && middle && end
            ? { kind: 'arc', start, middle, end, sourceId: form.id, span: form.span }
            : null
    }

    private analyzeCircle(form: ListNode, formIndex: number): CircleExpression | null {
        const args = this.collectArguments(form, ['center', 'radius'])
        this.rejectPositionalArguments(args, form, 'circle')
        const centerValue = this.requiredNamed(args, 'center', form)
        const radiusValue = this.requiredNamed(args, 'radius', form)
        const center = centerValue ? this.point2(centerValue, formIndex) : null
        const radius = radiusValue ? this.lengthExpression(radiusValue, formIndex) : null

        return center && radius
            ? { kind: 'circle', center, radius, sourceId: form.id, span: form.span }
            : null
    }

    private analyzeExtrude(form: ListNode, formIndex: number): ExtrudeExpression | null {
        const args = this.collectArguments(form, ['length', 'symmetric'])
        const lengthValue = this.requiredNamed(args, 'length', form)
        let profile: IdentifierNode | null = null

        if (args.positional.length === 0) {
            this.report('TCD-S004', 'extrude requires a sketch reference.', form.span)
        } else {
            profile = this.expectIdentifier(args.positional[0], 'extrude expects a sketch reference.')
            if (args.positional.length > 1) {
                this.report('TCD-S006', 'extrude accepts exactly one positional argument.', form.span)
            }
        }

        const length = lengthValue ? this.lengthExpression(lengthValue, formIndex) : null
        const symmetricValue = args.named.get('symmetric')?.value
        let symmetric = false

        if (symmetricValue) {
            if (symmetricValue.kind !== 'boolean') {
                this.typeError(symmetricValue, 'extrude symmetric must be true or false.')
            } else {
                symmetric = symmetricValue.value
            }
        }

        if (profile && !this.resolveReference(profile, formIndex, ['sketch'], 'extrude')) {
            profile = null
        }

        return profile && length
            ? {
                kind: 'extrude',
                profile: profile.value,
                length,
                symmetric,
                sourceId: form.id,
                span: form.span,
            }
            : null
    }

    private point2(value: ValueNode, formIndex: number): Point2Expression | null {
        if (value.kind !== 'list') {
            this.typeError(value, 'Expected a two-dimensional point.')
            return null
        }

        const values = value.items.filter((item): item is ValueNode => item.kind !== 'namedArgument')
        if (values.length !== value.items.length || values.length !== 2) {
            this.typeError(value, 'A two-dimensional point must contain exactly two length values.')
            return null
        }

        const x = this.lengthExpression(values[0], formIndex)
        const y = this.lengthExpression(values[1], formIndex)
        return x && y
            ? { kind: 'point2', values: [x, y], sourceId: value.id, span: value.span }
            : null
    }

    private point3(value: ValueNode, formIndex: number): Point3Expression | null {
        if (value.kind !== 'list' || value.items.length !== 3
            || value.items.some((item) => item.kind === 'namedArgument')) {
            this.typeError(value, 'origin must contain exactly three length values [x y z].')
            return null
        }
        const values = (value.items as ValueNode[]).map((item) => this.lengthExpression(item, formIndex))
        return values.every((item) => item !== null)
            ? {
                kind: 'point3',
                values: values as [LengthExpression, LengthExpression, LengthExpression],
                sourceId: value.id,
                span: value.span,
            }
            : null
    }

    private lengthExpression(value: ValueNode, formIndex: number): LengthExpression | null {
        if (value.kind === 'number') {
            return this.scalarLiteral(value)
        }

        if (value.kind === 'quantity') {
            if (value.unit !== 'mm') {
                this.typeError(value, 'Expected a length in mm, not an angle.')
                return null
            }
            return this.scalarLiteral(value)
        }

        if (value.kind === 'identifier') {
            if (!this.resolveReference(value, formIndex, ['length', 'number'], 'length')) {
                return null
            }
            return {
                kind: 'parameterReference',
                name: value.value,
                sourceId: value.id,
                span: value.span,
            }
        }

        this.typeError(value, 'Expected a length value or parameter reference.')
        return null
    }

    private scalarLiteral(value: ValueNode): ScalarLiteral | null {
        if (value.kind !== 'number' && value.kind !== 'quantity') {
            this.typeError(value, 'Expected a number or physical quantity.')
            return null
        }

        return {
            kind: 'scalarLiteral',
            value: value.value,
            unit: value.kind === 'quantity' ? value.unit : null,
            sourceId: value.id,
            span: value.span,
        }
    }

    private collectArguments(form: ListNode, allowedNamed: string[]): Arguments {
        const positional: ValueNode[] = []
        const named = new Map<string, NamedArgumentNode>()

        for (const item of form.items.slice(1)) {
            if (item.kind !== 'namedArgument') {
                positional.push(item)
                continue
            }

            if (!allowedNamed.includes(item.name.value)) {
                this.report(
                    'TCD-S005',
                    `Unknown argument "${item.name.value}" for command "${this.commandName(form)?.value ?? ''}".`,
                    item.name.span,
                )
                continue
            }

            const previous = named.get(item.name.value)
            if (previous) {
                this.report(
                    'TCD-S005',
                    `Argument "${item.name.value}" is specified more than once.`,
                    item.name.span,
                    [previous.name.span],
                )
                continue
            }

            named.set(item.name.value, item)
        }

        return { positional, named }
    }

    private requiredNamed(args: Arguments, name: string, form: ListNode): ValueNode | null {
        const argument = args.named.get(name)
        if (argument) {
            return argument.value
        }

        this.report(
            'TCD-S004',
            `Missing required argument "${name}" for command "${this.commandName(form)?.value ?? ''}".`,
            form.span,
        )
        return null
    }

    private rejectPositionalArguments(args: Arguments, form: ListNode, command: string) {
        if (args.positional.length > 0) {
            this.report(
                'TCD-S006',
                `${command} does not accept positional arguments.`,
                form.span,
            )
        }
    }

    private expectPositionalCount(
        args: Arguments,
        form: ListNode,
        command: string,
        count: number,
    ): boolean {
        if (args.positional.length === count) {
            return true
        }

        const code = args.positional.length < count ? 'TCD-S004' : 'TCD-S006'
        this.report(code, `${command} expects exactly ${count} positional arguments.`, form.span)
        return false
    }

    private expectIdentifier(value: ValueNode, message: string): IdentifierNode | null {
        if (value.kind === 'identifier') {
            return value
        }

        this.typeError(value, message)
        return null
    }

    private declareSymbol(name: IdentifierNode, type: SemanticType, formIndex: number): boolean {
        const previous = this.symbols.get(name.value)
        if (previous) {
            this.report(
                'TCD-S003',
                `Name "${name.value}" is already declared.`,
                name.span,
                [previous.span],
            )
            return false
        }

        this.symbols.set(name.value, { name: name.value, type, span: name.span })

        const indexes = this.declarationIndexes.get(name.value)
        if (indexes && !indexes.includes(formIndex)) {
            indexes.push(formIndex)
        }
        return true
    }

    private resolveReference(
        reference: IdentifierNode,
        formIndex: number,
        expectedTypes: SemanticType[],
        context: string,
    ): SymbolInfo | null {
        const symbol = this.symbols.get(reference.value)
        if (!symbol) {
            const declaredLater = this.declarationIndexes
                .get(reference.value)
                ?.some((index) => index >= formIndex)

            this.report(
                declaredLater ? 'TCD-S007' : 'TCD-S002',
                declaredLater
                    ? `Forward reference "${reference.value}" is not allowed in DSL v0.`
                    : `Unknown reference "${reference.value}".`,
                reference.span,
            )
            return null
        }

        if (symbol.type !== 'unknown' && !expectedTypes.includes(symbol.type)) {
            this.report(
                'TCD-S006',
                `${context} expects ${expectedTypes.join(' or ')}, but "${reference.value}" is ${symbol.type}.`,
                reference.span,
                [symbol.span],
            )
            return null
        }

        return symbol
    }

    private commandName(form: ListNode): IdentifierNode | null {
        const first = form.items[0]
        return first?.kind === 'identifier' ? first : null
    }

    private typeError(value: ValueNode, message: string) {
        this.report('TCD-S006', message, value.span)
    }

    private report(
        code: Parameters<typeof createSemanticDiagnostic>[0],
        message: string,
        span: SourceSpan,
        relatedSpans: SourceSpan[] = [],
    ) {
        this.diagnostics.push(createSemanticDiagnostic(
            code,
            message,
            span,
            this.revisionId,
            relatedSpans,
        ))
    }
}

export function analyzeTextCad(
    document: DocumentNode,
    options: SemanticOptions = {},
): SemanticResult {
    const analyzer = new SemanticAnalyzer(document, options.revisionId ?? 0)
    return analyzer.analyze()
}

export type {
    BooleanLiteralNode,
    NumberLiteralNode,
    QuantityLiteralNode,
    StringLiteralNode,
}
