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

export type SemanticType = 'number' | 'length' | 'angle' | 'sketch' | 'solid' | 'point2' | 'point3' | 'plane' | 'edges' | 'faces' | 'vertices' | 'unknown'

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

export type ScalarExpression = ScalarLiteral | ParameterReference
export type LengthExpression = ScalarExpression

export type Point2Expression = {
    kind: 'point2'
    values: [LengthExpression, LengthExpression]
    sourceId: NodeId
    span: SourceSpan
}

export type Point3Coordinates = {
    kind: 'point3'
    values: [LengthExpression, LengthExpression, LengthExpression]
    sourceId: NodeId
    span: SourceSpan
}

export type Point3Expression = Point3Coordinates | { kind: 'vertexPoint'; selection: SelectionExpression; sourceId: NodeId; span: SourceSpan }
type Located = { sourceId: NodeId; span: SourceSpan }
export type BasePlane = 'XY' | 'XZ' | 'YZ'
export type PlaneExpression = Located & {
    kind: 'plane'; base: BasePlane; origin?: Point3Expression; normal?: AxisExpression
    xDirection?: AxisExpression; face?: SelectionExpression; offset: LengthExpression
}
export type PlaneOperand = BasePlane | PlaneExpression
export type SelectionExpression = Located & {
    kind: 'edges' | 'faces' | 'vertices'; body: string; geometry?: string
    axis?: AxisExpression; extreme?: 'min' | 'max'; near?: Point3Expression
    within?: LengthExpression; length?: LengthExpression
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

export type EllipseExpression = Located & { kind: 'ellipse'; center: Point2Expression; radiusX: LengthExpression; radiusY: LengthExpression; angle: ScalarExpression }
export type PolylineExpression = Located & { kind: 'polyline' | 'polygon'; points: Point2Expression[]; closed: boolean }
export type RectangleExpression = Located & { kind: 'rectangle'; origin: Point2Expression; width: LengthExpression; height: LengthExpression }

export type CurveExpression = LineExpression | ArcExpression | CircleExpression | EllipseExpression | PolylineExpression | RectangleExpression

export type ProfileExpression = {
    kind: 'profile'
    role: 'outer' | 'hole'
    curves: CurveExpression[]
    sourceId: NodeId
    span: SourceSpan
}

export type SketchExpression = {
    kind: 'sketch'
    plane: PlaneOperand
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

export type Vector3Expression = {
    kind: 'vector3'
    values: [ScalarExpression, ScalarExpression, ScalarExpression]
    sourceId: NodeId
    span: SourceSpan
}

export type AxisExpression = 'X' | 'Y' | 'Z' | Vector3Expression

export type RevolveExpression = {
    kind: 'revolve'
    profile: string
    axis: AxisExpression
    origin?: Point3Expression
    angle: ScalarExpression
    sourceId: NodeId
    span: SourceSpan
}

export type CircularPatternExpression = {
    kind: 'pattern-circular'
    operand: SolidOperand
    axis: AxisExpression
    origin?: Point3Expression
    count: ScalarExpression
    angle: ScalarExpression
    startAngle: ScalarExpression
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

export type LoftExpression = Located & { kind: 'loft'; profiles: string[]; ruled: boolean }
export type TransformExpression = Located & (
    { kind: 'translate'; operand: SolidOperand; vector: Point3Expression }
    | { kind: 'rotate'; operand: SolidOperand; axis: AxisExpression; origin?: Point3Expression; angle: ScalarExpression }
    | { kind: 'scale'; operand: SolidOperand; factor: ScalarExpression; origin?: Point3Expression }
    | { kind: 'mirror'; operand: SolidOperand; plane: PlaneOperand; origin?: Point3Expression }
)
export type LinearPatternExpression = Located & { kind: 'pattern-linear'; operand: SolidOperand; axis: AxisExpression; count: ScalarExpression; spacing: LengthExpression }
export type FinishExpression = Located & { kind: 'fillet' | 'chamfer' | 'shell'; operand: SolidOperand; selection: SelectionExpression; size: LengthExpression }
export type HoleExpression = Located & {
    kind: 'hole'; operand: SolidOperand; origin: Point3Expression; axis: AxisExpression
    radius: LengthExpression; depth?: LengthExpression; through: boolean
    counterboreRadius?: LengthExpression; counterboreDepth?: LengthExpression
    countersinkRadius?: LengthExpression; countersinkAngle: ScalarExpression
}
export type ThreadExpression = Located & {
    kind: 'thread'; operand: SolidOperand; origin?: Point3Expression; axis: AxisExpression
    radius: LengthExpression; pitch: LengthExpression; length: LengthExpression; depth: LengthExpression
    internal: boolean; leftHanded: boolean
}
export type SolidExpression = ExtrudeExpression | RevolveExpression | CircularPatternExpression | BooleanExpression | LoftExpression | TransformExpression | LinearPatternExpression | FinishExpression | HoleExpression | ThreadExpression
export type SolidOperand = SolidReference | SolidExpression
export type ConstructionExpression = Point2Expression | Point3Expression | PlaneExpression | SelectionExpression
export type FeatureExpression = SketchExpression | SolidExpression | ConstructionExpression
export function isSolidExpression(expression: FeatureExpression): expression is SolidExpression {
    return !['sketch', 'point2', 'point3', 'vertexPoint', 'plane', 'edges', 'faces', 'vertices'].includes(expression.kind)
}

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
    valueType: Exclude<SemanticType, 'number' | 'length' | 'angle' | 'unknown'>
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
    'revolve', 'pattern-circular',
    'polyline', 'rectangle', 'polygon', 'ellipse', 'point', 'plane', 'loft',
    'fillet', 'chamfer', 'shell', 'translate', 'rotate', 'mirror', 'scale',
    'pattern-linear', 'edges', 'faces', 'vertices', 'hole', 'thread',
])
const KNOWN_COMMANDS = new Set([...TOP_LEVEL_COMMANDS, ...EXPRESSION_COMMANDS])

class SemanticAnalyzer {
    private readonly document: DocumentNode
    private readonly revisionId: number
    private readonly diagnostics: Diagnostic[] = []
    private readonly symbols = new Map<string, SymbolInfo>()
    private readonly declarationIndexes = new Map<string, number[]>()
    private readonly constructions = new Map<string, ConstructionExpression>()
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
        const valueType = expression ? isSolidExpression(expression) ? 'solid'
            : expression.kind === 'vertexPoint' ? 'point3' : expression.kind : 'unknown'

        if (!this.declareSymbol(name, valueType, formIndex) || !expression || valueType === 'unknown') {
            return null
        }
        if (!isSolidExpression(expression) && expression.kind !== 'sketch') this.constructions.set(name.value, expression)

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
            case 'point': return this.analyzePoint(form, formIndex)
            case 'plane': return this.analyzePlane(form, formIndex)
            case 'edges': case 'faces': case 'vertices': return this.analyzeSelection(form, formIndex, command.value)
            case 'loft': return this.analyzeLoft(form, formIndex)
            case 'translate': case 'rotate': case 'mirror': case 'scale': return this.analyzeTransform(form, formIndex, command.value)
            case 'pattern-linear': return this.analyzeLinearPattern(form, formIndex)
            case 'fillet': case 'chamfer': case 'shell': return this.analyzeFinish(form, formIndex, command.value)
            case 'hole': return this.analyzeHole(form, formIndex)
            case 'thread': return this.analyzeThread(form, formIndex)
            case 'sketch':
                return this.analyzeSketch(form, formIndex)
            case 'extrude':
                return this.analyzeExtrude(form, formIndex)
            case 'revolve':
                return this.analyzeRevolve(form, formIndex)
            case 'pattern-circular':
                return this.analyzeCircularPattern(form, formIndex)
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
        const plane = planeValue ? this.planeOperand(planeValue, formIndex) : null

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
            const operand = this.solidOperand(value, formIndex, kind)
            if (operand) operands.push(operand)
        }

        return operands.length === args.positional.length
            ? { kind, operands, sourceId: form.id, span: form.span }
            : null
    }

    private solidOperand(value: ValueNode, formIndex: number, context: string): SolidOperand | null {
        if (value.kind === 'identifier') {
            return this.resolveReference(value, formIndex, ['solid'], context)
                ? { kind: 'solidReference', name: value.value, sourceId: value.id, span: value.span }
                : null
        }
        if (value.kind === 'list') {
            const expression = this.analyzeFeatureExpression(value, formIndex)
            if (expression && isSolidExpression(expression)) {
                return expression
            } else if (expression) {
                this.typeError(value, `${context} expects a solid.`)
            }
            return null
        }
        this.typeError(value, `${context} expects a solid reference or a solid operation.`)
        return null
    }

    private analyzeRevolve(form: ListNode, formIndex: number): RevolveExpression | null {
        const args = this.collectArguments(form, ['axis', 'origin', 'angle'])
        if (!this.expectPositionalCount(args, form, 'revolve', 1)) return null
        const profile = this.expectIdentifier(args.positional[0], 'revolve expects a sketch reference.')
        if (!profile || !this.resolveReference(profile, formIndex, ['sketch'], 'revolve')) return null
        const axis = this.axisArgument(args, formIndex)
        const originValue = args.named.get('origin')?.value
        const origin = originValue ? this.point3(originValue, formIndex) : undefined
        const angle = this.scalarArgument(args, 'angle', 'angle', form, formIndex, 360)
        return axis && angle
            ? { kind: 'revolve', profile: profile.value, axis, origin: origin ?? undefined, angle, sourceId: form.id, span: form.span }
            : null
    }

    private analyzeCircularPattern(form: ListNode, formIndex: number): CircularPatternExpression | null {
        const args = this.collectArguments(form, ['axis', 'origin', 'count', 'angle', 'start-angle'])
        if (!this.expectPositionalCount(args, form, 'pattern-circular', 1)) return null
        const operand = this.solidOperand(args.positional[0], formIndex, 'pattern-circular')
        const axis = this.axisArgument(args, formIndex)
        const originValue = args.named.get('origin')?.value
        const origin = originValue ? this.point3(originValue, formIndex) : undefined
        const count = this.scalarArgument(args, 'count', 'number', form, formIndex)
        const angle = this.scalarArgument(args, 'angle', 'angle', form, formIndex, 360)
        const startAngle = this.scalarArgument(args, 'start-angle', 'angle', form, formIndex, 0)
        return operand && axis && count && angle && startAngle
            ? {
                kind: 'pattern-circular', operand, axis, origin: origin ?? undefined,
                count, angle, startAngle, sourceId: form.id, span: form.span,
            }
            : null
    }

    private axisArgument(args: Arguments, formIndex: number, name = 'axis'): AxisExpression | null {
        const value = args.named.get(name)?.value
        if (!value) return 'Z'
        if (value.kind === 'identifier' && ['X', 'Y', 'Z'].includes(value.value)) {
            return value.value as 'X' | 'Y' | 'Z'
        }
        if (value.kind === 'list' && value.items.length === 3
            && value.items.every((item) => item.kind !== 'namedArgument')) {
            const values = (value.items as ValueNode[]).map((item) => this.typedScalar(item, formIndex, 'number'))
            if (values.every((item) => item !== null)) {
                return {
                    kind: 'vector3', values: values as Vector3Expression['values'],
                    sourceId: value.id, span: value.span,
                }
            }
            return null
        }
        this.typeError(value, 'axis must be X, Y, Z or a dimensionless direction [x y z].')
        return null
    }

    private scalarArgument(
        args: Arguments, name: string, type: 'number' | 'angle' | 'length', form: ListNode,
        formIndex: number, fallback?: number,
    ): ScalarExpression | null {
        const value = args.named.get(name)?.value
        if (value) return this.typedScalar(value, formIndex, type)
        if (fallback !== undefined) {
            return { kind: 'scalarLiteral', value: fallback, unit: type === 'angle' ? 'deg' : type === 'length' ? 'mm' : null, sourceId: form.id, span: form.span }
        }
        this.requiredNamed(args, name, form)
        return null
    }

    private typedScalar(value: ValueNode, formIndex: number, type: 'number' | 'angle' | 'length'): ScalarExpression | null {
        if (type === 'length') return this.lengthExpression(value, formIndex)
        if (value.kind === 'number' || (type === 'angle' && value.kind === 'quantity' && value.unit === 'deg')) {
            return this.scalarLiteral(value)
        }
        if (value.kind === 'identifier') {
            if (!this.resolveReference(value, formIndex, type === 'angle' ? ['angle', 'number'] : ['number'], type)) return null
            return { kind: 'parameterReference', name: value.value, sourceId: value.id, span: value.span }
        }
        this.typeError(value, type === 'angle' ? 'Expected an angle in deg or an angle parameter.' : 'Expected a dimensionless number or number parameter.')
        return null
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
            case 'polyline': case 'polygon': return this.analyzePolyline(form, formIndex, command.value)
            case 'rectangle': return this.analyzeRectangle(form, formIndex)
            case 'ellipse': return this.analyzeEllipse(form, formIndex)
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

    private booleanArgument(args: Arguments, name: string, fallback = false): boolean {
        const value = args.named.get(name)?.value
        if (!value) return fallback
        if (value.kind === 'boolean') return value.value
        this.typeError(value, `${name} must be true or false.`)
        return fallback
    }

    private optionalPoint(args: Arguments, name: string, index: number): Point3Expression | undefined {
        const value = args.named.get(name)?.value
        return value ? this.point3(value, index) ?? undefined : undefined
    }

    private optionalLength(args: Arguments, name: string, index: number): LengthExpression | undefined {
        const value = args.named.get(name)?.value
        return value ? this.lengthExpression(value, index) ?? undefined : undefined
    }

    private analyzePoint(form: ListNode, index: number): Point2Expression | Point3Expression | null {
        const args = this.collectArguments(form, [])
        if (!this.expectPositionalCount(args, form, 'point', 1)) return null
        const value = args.positional[0]
        if (value.kind === 'list' && value.items.length === 2
            && !(value.items[0]?.kind === 'identifier' && ['point', 'vertices'].includes(value.items[0].value))) return this.point2(value, index)
        if (value.kind === 'identifier' && this.symbols.get(value.value)?.type === 'point2') return this.point2(value, index)
        if (value.kind === 'list' && this.commandName(value)?.value === 'point') return this.analyzePoint(value, index)
        return this.point3(value, index)
    }

    private planeOperand(value: ValueNode, index: number): PlaneOperand | null {
        if (value.kind === 'identifier') {
            if (['XY', 'XZ', 'YZ'].includes(value.value)) return value.value as BasePlane
            if (!this.resolveReference(value, index, ['plane'], 'plane')) return null
            const plane = this.constructions.get(value.value)
            return plane?.kind === 'plane' ? { ...plane, sourceId: value.id, span: value.span } : null
        }
        if (value.kind === 'list' && this.commandName(value)?.value === 'plane') return this.analyzePlane(value, index)
        this.typeError(value, 'Expected XY, XZ, YZ, a plane reference or a plane expression.')
        return null
    }

    private analyzePlane(form: ListNode, index: number): PlaneExpression | null {
        const args = this.collectArguments(form, ['base', 'origin', 'normal', 'x-direction', 'face', 'offset'])
        this.rejectPositionalArguments(args, form, 'plane')
        const baseValue = args.named.get('base')?.value
        let base: BasePlane = 'XY'
        if (baseValue) {
            if (baseValue.kind === 'identifier' && ['XY', 'XZ', 'YZ'].includes(baseValue.value)) base = baseValue.value as BasePlane
            else this.typeError(baseValue, 'plane base must be XY, XZ or YZ.')
        }
        const faceValue = args.named.get('face')?.value
        const face = faceValue ? this.selectionOperand(faceValue, index, 'faces') : undefined
        if (faceValue && (baseValue || args.named.has('normal'))) this.typeError(faceValue, 'face cannot be combined with base or normal.')
        const normal = args.named.has('normal') ? this.axisArgument(args, index, 'normal') : undefined
        const xDirection = args.named.has('x-direction') ? this.axisArgument(args, index, 'x-direction') : undefined
        const offset = this.scalarArgument(args, 'offset', 'length', form, index, 0)
        return offset ? { kind: 'plane', base, origin: this.optionalPoint(args, 'origin', index), normal: normal ?? undefined,
            xDirection: xDirection ?? undefined, face: face ?? undefined, offset, sourceId: form.id, span: form.span } : null
    }

    private selectionOperand(value: ValueNode, index: number, kind: SelectionExpression['kind']): SelectionExpression | null {
        if (value.kind === 'identifier') {
            if (!this.resolveReference(value, index, [kind], kind)) return null
            const selection = this.constructions.get(value.value)
            return selection?.kind === kind ? { ...selection, sourceId: value.id, span: value.span } : null
        }
        if (value.kind === 'list' && this.commandName(value)?.value === kind) return this.analyzeSelection(value, index, kind)
        this.typeError(value, `Expected a ${kind} selection or reference.`)
        return null
    }

    private analyzeSelection(form: ListNode, index: number, kind: SelectionExpression['kind']): SelectionExpression | null {
        const args = this.collectArguments(form, ['type', 'axis', 'extreme', 'near', 'within', 'length'])
        if (!this.expectPositionalCount(args, form, kind, 1)) return null
        const body = this.expectIdentifier(args.positional[0], `${kind} expects a solid reference.`)
        if (!body || !this.resolveReference(body, index, ['solid'], kind)) return null
        const type = args.named.get('type')?.value
        const allowed = kind === 'edges' ? ['line', 'circle', 'ellipse', 'bspline', 'bezier', 'hyperbola', 'parabola', 'other']
            : kind === 'faces' ? ['plane', 'cylinder', 'cone', 'sphere', 'torus', 'bspline', 'bezier', 'revolution', 'extrusion', 'other'] : []
        let geometry: string | undefined
        if (type) {
            if (type.kind === 'identifier' && allowed.includes(type.value)) geometry = type.value
            else this.typeError(type, `${kind} type must be one of: ${allowed.join(', ') || '(none)'}.`)
        }
        const extremeValue = args.named.get('extreme')?.value
        let extreme: 'min' | 'max' | undefined
        if (extremeValue) {
            if (extremeValue.kind === 'identifier' && ['min', 'max'].includes(extremeValue.value)) extreme = extremeValue.value as 'min' | 'max'
            else this.typeError(extremeValue, 'extreme must be min or max.')
            if (!args.named.has('axis')) this.requiredNamed(args, 'axis', form)
        }
        if (args.named.has('near') !== args.named.has('within')) this.report('TCD-S004', 'near and within must be specified together.', form.span)
        if (kind !== 'edges' && args.named.has('length')) this.typeError(args.named.get('length')!.value, 'length is only supported by edges.')
        if (kind === 'vertices' && args.named.has('axis') && !extreme) this.typeError(args.named.get('axis')!.value, 'vertices axis requires extreme.')
        return { kind, body: body.value, geometry, extreme,
            axis: args.named.has('axis') ? this.axisArgument(args, index) ?? undefined : undefined,
            near: this.optionalPoint(args, 'near', index), within: this.optionalLength(args, 'within', index),
            length: this.optionalLength(args, 'length', index), sourceId: form.id, span: form.span }
    }

    private analyzePolyline(form: ListNode, index: number, kind: 'polyline' | 'polygon'): PolylineExpression | null {
        const args = this.collectArguments(form, kind === 'polyline' ? ['closed'] : [])
        const minimum = kind === 'polygon' ? 3 : 2
        if (args.positional.length < minimum || args.positional.length > 512) {
            this.report('TCD-S006', `${kind} expects ${minimum} to 512 points as positional arguments.`, form.span)
            return null
        }
        const points = args.positional.map((value) => this.point2(value, index))
        return points.every((point) => point !== null) ? { kind, points, closed: kind === 'polygon' || this.booleanArgument(args, 'closed'), sourceId: form.id, span: form.span } : null
    }

    private analyzeRectangle(form: ListNode, index: number): RectangleExpression | null {
        const args = this.collectArguments(form, ['origin', 'width', 'height'])
        this.rejectPositionalArguments(args, form, 'rectangle')
        const originValue = this.requiredNamed(args, 'origin', form)
        const origin = originValue ? this.point2(originValue, index) : null
        const width = this.scalarArgument(args, 'width', 'length', form, index)
        const height = this.scalarArgument(args, 'height', 'length', form, index)
        return origin && width && height ? { kind: 'rectangle', origin, width, height, sourceId: form.id, span: form.span } : null
    }

    private analyzeEllipse(form: ListNode, index: number): EllipseExpression | null {
        const args = this.collectArguments(form, ['center', 'radius-x', 'radius-y', 'angle'])
        this.rejectPositionalArguments(args, form, 'ellipse')
        const centerValue = this.requiredNamed(args, 'center', form)
        const center = centerValue ? this.point2(centerValue, index) : null
        const radiusX = this.scalarArgument(args, 'radius-x', 'length', form, index)
        const radiusY = this.scalarArgument(args, 'radius-y', 'length', form, index)
        const angle = this.scalarArgument(args, 'angle', 'angle', form, index, 0)
        return center && radiusX && radiusY && angle ? { kind: 'ellipse', center, radiusX, radiusY, angle, sourceId: form.id, span: form.span } : null
    }

    private analyzeLoft(form: ListNode, index: number): LoftExpression | null {
        const args = this.collectArguments(form, ['ruled'])
        if (args.positional.length < 2 || args.positional.length > 32) {
            this.report('TCD-S006', 'loft expects 2 to 32 sketch references in section order.', form.span)
            return null
        }
        const profiles: string[] = []
        for (const value of args.positional) {
            const ref = this.expectIdentifier(value, 'loft expects sketch references.')
            if (ref && this.resolveReference(ref, index, ['sketch'], 'loft')) profiles.push(ref.value)
        }
        return profiles.length === args.positional.length ? { kind: 'loft', profiles, ruled: this.booleanArgument(args, 'ruled'), sourceId: form.id, span: form.span } : null
    }

    private analyzeTransform(form: ListNode, index: number, kind: TransformExpression['kind']): TransformExpression | null {
        const names = kind === 'translate' ? ['vector'] : kind === 'rotate' ? ['axis', 'origin', 'angle'] : kind === 'scale' ? ['factor', 'origin'] : ['plane', 'origin']
        const args = this.collectArguments(form, names)
        if (!this.expectPositionalCount(args, form, kind, 1)) return null
        const operand = this.solidOperand(args.positional[0], index, kind)
        if (!operand) return null
        const location = { operand, sourceId: form.id, span: form.span }
        if (kind === 'translate') {
            const value = this.requiredNamed(args, 'vector', form)
            const vector = value ? this.point3(value, index) : null
            return vector ? { kind, vector, ...location } : null
        }
        const origin = this.optionalPoint(args, 'origin', index)
        if (kind === 'rotate') {
            const axis = this.axisArgument(args, index)
            const angle = this.scalarArgument(args, 'angle', 'angle', form, index)
            return axis && angle ? { kind, axis, angle, origin, ...location } : null
        }
        if (kind === 'scale') {
            const factor = this.scalarArgument(args, 'factor', 'number', form, index)
            return factor ? { kind, factor, origin, ...location } : null
        }
        const value = this.requiredNamed(args, 'plane', form)
        const plane = value ? this.planeOperand(value, index) : null
        return plane ? { kind, plane, origin, ...location } : null
    }

    private analyzeLinearPattern(form: ListNode, index: number): LinearPatternExpression | null {
        const args = this.collectArguments(form, ['axis', 'spacing', 'count'])
        if (!this.expectPositionalCount(args, form, 'pattern-linear', 1)) return null
        const operand = this.solidOperand(args.positional[0], index, 'pattern-linear')
        const axis = this.axisArgument(args, index)
        const spacing = this.scalarArgument(args, 'spacing', 'length', form, index)
        const count = this.scalarArgument(args, 'count', 'number', form, index)
        return operand && axis && spacing && count ? { kind: 'pattern-linear', operand, axis, spacing, count, sourceId: form.id, span: form.span } : null
    }

    private analyzeFinish(form: ListNode, index: number, kind: FinishExpression['kind']): FinishExpression | null {
        const selector = kind === 'shell' ? 'faces' : 'edges'
        const sizeName = kind === 'shell' ? 'thickness' : kind === 'fillet' ? 'radius' : 'distance'
        const args = this.collectArguments(form, [selector, sizeName])
        if (!this.expectPositionalCount(args, form, kind, 1)) return null
        const operand = this.solidOperand(args.positional[0], index, kind)
        const value = this.requiredNamed(args, selector, form)
        const selection = value ? this.selectionOperand(value, index, selector) : null
        const size = this.scalarArgument(args, sizeName, 'length', form, index)
        return operand && selection && size ? { kind, operand, selection, size, sourceId: form.id, span: form.span } : null
    }

    private analyzeHole(form: ListNode, index: number): HoleExpression | null {
        const args = this.collectArguments(form, ['origin', 'axis', 'radius', 'depth', 'through', 'counterbore-radius', 'counterbore-depth', 'countersink-radius', 'countersink-angle'])
        if (!this.expectPositionalCount(args, form, 'hole', 1)) return null
        const operand = this.solidOperand(args.positional[0], index, 'hole')
        const originValue = this.requiredNamed(args, 'origin', form)
        const origin = originValue ? this.point3(originValue, index) : null
        const axis = this.axisArgument(args, index)
        const radius = this.scalarArgument(args, 'radius', 'length', form, index)
        const through = this.booleanArgument(args, 'through')
        if (through && args.named.has('depth')) this.typeError(args.named.get('depth')!.value, 'hole uses either through=true or depth, not both.')
        if (!through && !args.named.has('depth')) this.requiredNamed(args, 'depth', form)
        if (args.named.has('counterbore-radius') !== args.named.has('counterbore-depth')) this.report('TCD-S004', 'counterbore-radius and counterbore-depth must be provided together.', form.span)
        if (args.named.has('counterbore-radius') && args.named.has('countersink-radius')) this.typeError(form, 'Choose a counterbore or countersink, not both.')
        if (args.named.has('countersink-angle') && !args.named.has('countersink-radius')) this.requiredNamed(args, 'countersink-radius', form)
        const countersinkAngle = this.scalarArgument(args, 'countersink-angle', 'angle', form, index, 90)
        return operand && origin && axis && radius && countersinkAngle ? { kind: 'hole', operand, origin, axis, radius, through,
            depth: this.optionalLength(args, 'depth', index), counterboreRadius: this.optionalLength(args, 'counterbore-radius', index),
            counterboreDepth: this.optionalLength(args, 'counterbore-depth', index), countersinkRadius: this.optionalLength(args, 'countersink-radius', index),
            countersinkAngle, sourceId: form.id, span: form.span } : null
    }

    private analyzeThread(form: ListNode, index: number): ThreadExpression | null {
        const args = this.collectArguments(form, ['origin', 'axis', 'radius', 'pitch', 'length', 'depth', 'internal', 'left-handed'])
        if (!this.expectPositionalCount(args, form, 'thread', 1)) return null
        const operand = this.solidOperand(args.positional[0], index, 'thread')
        const axis = this.axisArgument(args, index)
        const radius = this.scalarArgument(args, 'radius', 'length', form, index)
        const pitch = this.scalarArgument(args, 'pitch', 'length', form, index)
        const length = this.scalarArgument(args, 'length', 'length', form, index)
        const depth = this.scalarArgument(args, 'depth', 'length', form, index)
        return operand && axis && radius && pitch && length && depth ? { kind: 'thread', operand, axis, radius, pitch, length, depth,
            origin: this.optionalPoint(args, 'origin', index), internal: this.booleanArgument(args, 'internal'),
            leftHanded: this.booleanArgument(args, 'left-handed'), sourceId: form.id, span: form.span } : null
    }

    private point2(value: ValueNode, formIndex: number): Point2Expression | null {
        if (value.kind === 'identifier') {
            if (!this.resolveReference(value, formIndex, ['point2'], 'point')) return null
            const point = this.constructions.get(value.value)
            return point?.kind === 'point2' ? { ...point, sourceId: value.id, span: value.span } : null
        }
        if (value.kind === 'list' && this.commandName(value)?.value === 'point') {
            const point = this.analyzePoint(value, formIndex)
            if (point?.kind === 'point2') return point
            this.typeError(value, 'Expected a two-dimensional point.')
            return null
        }
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
        if (value.kind === 'identifier') {
            const symbol = this.symbols.get(value.value)
            if (symbol?.type === 'vertices') {
                const selection = this.selectionOperand(value, formIndex, 'vertices')
                return selection ? { kind: 'vertexPoint', selection, sourceId: value.id, span: value.span } : null
            }
            if (!this.resolveReference(value, formIndex, ['point3'], 'point')) return null
            const point = this.constructions.get(value.value)
            return point?.kind === 'point3' || point?.kind === 'vertexPoint' ? { ...point, sourceId: value.id, span: value.span } : null
        }
        if (value.kind === 'list' && this.commandName(value)?.value === 'vertices') {
            const selection = this.analyzeSelection(value, formIndex, 'vertices')
            return selection ? { kind: 'vertexPoint', selection, sourceId: value.id, span: value.span } : null
        }
        if (value.kind === 'list' && this.commandName(value)?.value === 'point') {
            const point = this.analyzePoint(value, formIndex)
            if (point && point.kind !== 'point2') return point
            this.typeError(value, 'Expected a three-dimensional point.')
            return null
        }
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
