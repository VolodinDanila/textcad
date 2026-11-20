import {
    draw,
    drawCircle,
    getOC,
    measureVolume,
    Sketches,
    type Drawing,
    type Shape3D,
} from 'replicad'

import {
    createGeometryDiagnostic,
    type Diagnostic,
    type GeometryDiagnosticCode,
    type SourceSpan,
} from './diagnostics.ts'
import type {
    ArcExpression,
    AxisExpression,
    BooleanExpression,
    CircularPatternExpression,
    CurveExpression,
    ExtrudeExpression,
    LengthExpression,
    LineExpression,
    Point2Expression,
    ProfileExpression,
    RevolveExpression,
    SemanticProgram,
    SketchExpression,
    SolidExpression,
    SolidOperand,
} from './semantic.ts'

export type EvaluationOptions = {
    revisionId?: number
    tolerance?: number
}

export type EvaluatedParameter = {
    name: string
    value: number
    unit: 'mm' | 'deg' | null
}

export type EvaluatedSketchArtifact = {
    kind: 'sketch'
    name: string
    drawing: Drawing
    plane: 'XY' | 'XZ' | 'YZ'
    origin: [number, number, number]
    sourceId: string
}

export type EvaluatedSolidArtifact = {
    kind: 'solid'
    name: string
    shape: Shape3D
    operation: SolidExpression['kind']
    distance?: number
    angle?: number
    count?: number
    inputs: string[]
    solidCount: number
    sourceId: string
}

export type EvaluatedArtifact = EvaluatedSketchArtifact | EvaluatedSolidArtifact

export type EvaluatedRoot = {
    name: string
    label: string | null
    shape: Shape3D
    sourceId: string
    solidCount: number
}

export type EvaluationResult = {
    revisionId: number
    parameters: EvaluatedParameter[]
    artifacts: EvaluatedArtifact[]
    roots: EvaluatedRoot[]
    diagnostics: Diagnostic[]
}

type Point2 = [number, number]

type ParameterValue = {
    value: number
    unit: 'mm' | 'deg' | null
}

const PLANE_NORMALS: Record<SketchExpression['plane'], [number, number, number]> = {
    XY: [0, 0, 1],
    XZ: [0, -1, 0],
    YZ: [1, 0, 0],
}

class EvaluationFault extends Error {
    readonly code: GeometryDiagnosticCode
    readonly span: SourceSpan

    constructor(code: GeometryDiagnosticCode, message: string, span: SourceSpan) {
        super(message)
        this.name = 'EvaluationFault'
        this.code = code
        this.span = span
    }
}

class Evaluator {
    private readonly program: SemanticProgram
    private readonly revisionId: number
    private readonly tolerance: number
    private readonly diagnostics: Diagnostic[] = []
    private readonly parameters = new Map<string, ParameterValue>()
    private readonly artifacts = new Map<string, EvaluatedArtifact>()

    constructor(program: SemanticProgram, options: EvaluationOptions) {
        this.program = program
        this.revisionId = options.revisionId ?? 0
        this.tolerance = options.tolerance ?? 1e-7
    }

    evaluate(): EvaluationResult {
        for (const parameter of this.program.parameters) {
            this.parameters.set(parameter.name, {
                value: parameter.value.value,
                unit: parameter.value.unit,
            })
        }

        for (const binding of this.program.bindings) {
            try {
                if (binding.expression.kind === 'sketch') {
                    const artifact = this.evaluateSketch(binding.name, binding.expression)
                    this.artifacts.set(binding.name, artifact)
                    continue
                }

                const expression = binding.expression
                const shape = this.evaluateSolid(expression)
                this.artifacts.set(binding.name, {
                    kind: 'solid',
                    name: binding.name,
                    shape,
                    operation: expression.kind,
                    distance: expression.kind === 'extrude' ? this.evaluateLength(expression.length) : undefined,
                    angle: expression.kind === 'revolve' || expression.kind === 'pattern-circular'
                        ? this.evaluateLength(expression.angle) : undefined,
                    count: expression.kind === 'pattern-circular' ? this.evaluateLength(expression.count) : undefined,
                    inputs: this.solidInputs(expression),
                    solidCount: this.countSolids(shape),
                    sourceId: expression.sourceId,
                })
            } catch (error) {
                this.captureError(error, binding.expression.span)
            }
        }

        const roots: EvaluatedRoot[] = []
        const published = new Set<string>()
        for (const root of this.program.roots) {
            const artifact = this.artifacts.get(root.reference)
            if (artifact?.kind !== 'solid' || published.has(root.reference)) {
                continue
            }
            published.add(root.reference)

            roots.push({
                name: root.reference,
                label: root.label,
                shape: artifact.shape,
                sourceId: root.sourceId,
                solidCount: artifact.solidCount,
            })
        }

        return {
            revisionId: this.revisionId,
            parameters: this.program.parameters.map(({ name, value }) => ({
                name,
                value: value.value,
                unit: value.unit,
            })),
            artifacts: [...this.artifacts.values()],
            roots,
            diagnostics: this.diagnostics,
        }
    }

    private evaluateSketch(name: string, expression: SketchExpression): EvaluatedSketchArtifact {
        const profiles = expression.profiles.map((profile) => ({
            role: profile.role,
            drawing: this.evaluateProfile(profile),
        }))
        const outerProfiles = profiles.filter(({ role }) => role === 'outer')
        const holes = profiles.filter(({ role }) => role === 'hole')

        if (outerProfiles.length === 0) {
            throw new EvaluationFault(
                'TCD-G005',
                'Sketch does not contain an outer profile.',
                expression.span,
            )
        }

        let drawing = outerProfiles[0].drawing
        for (const outer of outerProfiles.slice(1)) {
            drawing = drawing.fuse(outer.drawing)
        }
        for (const hole of holes) {
            drawing = drawing.cut(hole.drawing)
        }

        return {
            kind: 'sketch',
            name,
            drawing,
            plane: expression.plane,
            origin: expression.origin
                ? expression.origin.values.map((value) => this.evaluateLength(value)) as [number, number, number]
                : [0, 0, 0],
            sourceId: expression.sourceId,
        }
    }

    private evaluateProfile(profile: ProfileExpression): Drawing {
        const circle = profile.curves.find(({ kind }) => kind === 'circle')
        if (circle) {
            if (profile.curves.length !== 1 || circle.kind !== 'circle') {
                throw new EvaluationFault(
                    'TCD-G004',
                    'A circle must be the only curve in its profile.',
                    profile.span,
                )
            }

            const radius = this.evaluateLength(circle.radius)
            if (radius <= 0) {
                throw new EvaluationFault(
                    'TCD-G004',
                    'Circle radius must be greater than zero.',
                    circle.span,
                )
            }

            const center = this.evaluatePoint(circle.center)
            return drawCircle(radius).translate(center)
        }

        const firstCurve = profile.curves[0]
        if (!firstCurve) {
            throw new EvaluationFault('TCD-G005', 'Profile is empty.', profile.span)
        }

        const firstPoint = this.curveStart(firstCurve)
        let currentPoint = firstPoint
        let pen = draw(firstPoint)

        for (const curve of profile.curves) {
            const start = this.curveStart(curve)
            if (!this.pointsEqual(currentPoint, start)) {
                throw new EvaluationFault(
                    'TCD-G002',
                    'Adjacent curves do not share the same endpoint.',
                    curve.span,
                )
            }

            if (curve.kind === 'line') {
                currentPoint = this.evaluatePoint(curve.end)
                pen = pen.lineTo(currentPoint)
                continue
            }

            if (curve.kind === 'arc') {
                const middle = this.evaluatePoint(curve.middle)
                const end = this.evaluatePoint(curve.end)
                this.validateArc(currentPoint, middle, end, curve)
                currentPoint = end
                pen = pen.threePointsArcTo(end, middle)
            }
        }

        if (!this.pointsEqual(currentPoint, firstPoint)) {
            throw new EvaluationFault(
                'TCD-G001',
                'Profile is not closed.',
                profile.span,
            )
        }

        this.validateLineProfile(profile)

        return pen.close()
    }

    private evaluateExtrude(expression: ExtrudeExpression): Shape3D {
        const profile = this.artifacts.get(expression.profile)
        if (profile?.kind !== 'sketch') {
            throw new EvaluationFault('TCD-G005', `Sketch "${expression.profile}" could not be built.`, expression.span)
        }

        const distance = this.evaluateLength(expression.length)
        if (Math.abs(distance) <= this.tolerance) {
            throw new EvaluationFault(
                'TCD-G005',
                'Extrusion length must not be zero.',
                expression.span,
            )
        }

        const sketch = profile.drawing.sketchOnPlane(profile.plane, profile.origin)
        let shape: Shape3D | undefined
        try {
            shape = sketch.extrude(distance).asShape3D()
            if (expression.symmetric) {
                const normal = PLANE_NORMALS[profile.plane]
                shape = shape.translate(
                    normal[0] * -distance / 2,
                    normal[1] * -distance / 2,
                    normal[2] * -distance / 2,
                )
            }
            return shape
        } catch (error) {
            shape?.delete()
            throw error
        } finally {
            if (sketch instanceof Sketches) {
                for (const item of sketch.sketches) item.delete()
            } else if ('delete' in sketch && typeof sketch.delete === 'function') {
                sketch.delete()
            }
        }
    }

    private evaluateSolid(expression: SolidExpression): Shape3D {
        const shape = expression.kind === 'extrude'
            ? this.evaluateExtrude(expression)
            : expression.kind === 'revolve'
                ? this.evaluateRevolve(expression)
                : expression.kind === 'pattern-circular'
                    ? this.evaluateCircularPattern(expression)
                    : this.evaluateBoolean(expression)
        try {
            this.validateSolid(shape, expression.span)
            return shape
        } catch (error) {
            shape.delete()
            throw error
        }
    }

    private axisDirection(axis: AxisExpression, span: SourceSpan): [number, number, number] {
        const direction: [number, number, number] = typeof axis === 'string'
            ? axis === 'X' ? [1, 0, 0] : axis === 'Y' ? [0, 1, 0] : [0, 0, 1]
            : axis.values.map((value) => this.evaluateLength(value)) as [number, number, number]
        const length = Math.hypot(...direction)
        if (!Number.isFinite(length) || length <= this.tolerance) {
            throw new EvaluationFault('TCD-G004', 'Axis direction must be a finite non-zero vector.', span)
        }
        return direction.map((value) => value / length) as [number, number, number]
    }

    private rotationAngle(value: LengthExpression, span: SourceSpan): number {
        const angle = this.evaluateLength(value)
        if (!Number.isFinite(angle) || Math.abs(angle) <= this.tolerance || Math.abs(angle) > 360) {
            throw new EvaluationFault('TCD-G004', 'Rotation span must be non-zero and between -360deg and 360deg.', span)
        }
        return angle
    }

    private evaluateRevolve(expression: RevolveExpression): Shape3D {
        const profile = this.artifacts.get(expression.profile)
        if (profile?.kind !== 'sketch') {
            throw new EvaluationFault('TCD-G005', `Sketch "${expression.profile}" could not be built.`, expression.span)
        }
        const axis = this.axisDirection(expression.axis, expression.span)
        const angle = this.rotationAngle(expression.angle, expression.span)
        const origin = expression.origin
            ? expression.origin.values.map((value) => this.evaluateLength(value)) as [number, number, number]
            : [0, 0, 0] as [number, number, number]
        const sketch = profile.drawing.sketchOnPlane(profile.plane, profile.origin)
        try {
            return sketch.revolve(axis, { origin, angle }).asShape3D()
        } finally {
            if (sketch instanceof Sketches) {
                for (const item of sketch.sketches) item.delete()
            } else if ('delete' in sketch && typeof sketch.delete === 'function') {
                sketch.delete()
            }
        }
    }

    private evaluateCircularPattern(expression: CircularPatternExpression): Shape3D {
        const count = this.evaluateLength(expression.count)
        if (!Number.isInteger(count) || count < 1 || count > 128) {
            throw new EvaluationFault('TCD-G004', 'pattern-circular count must be an integer from 1 to 128, including the original.', expression.span)
        }
        const angle = this.rotationAngle(expression.angle, expression.span)
        const startAngle = this.evaluateLength(expression.startAngle)
        if (!Number.isFinite(startAngle)) {
            throw new EvaluationFault('TCD-G004', 'pattern-circular start-angle must be finite.', expression.span)
        }
        const axis = this.axisDirection(expression.axis, expression.span)
        const origin = expression.origin
            ? expression.origin.values.map((value) => this.evaluateLength(value)) as [number, number, number]
            : [0, 0, 0] as [number, number, number]
        const fullCircle = Math.abs(Math.abs(angle) - 360) <= this.tolerance
        const step = count === 1 ? 0 : angle / (fullCircle ? count : count - 1)
        const base = this.evaluateOperand(expression.operand)
        let result: Shape3D | undefined
        try {
            for (let index = 0; index < count; index += 1) {
                let copy = base.clone()
                try {
                    copy = copy.rotate(startAngle + index * step, origin, axis)
                    if (!result) {
                        result = copy.clone()
                    } else {
                        const next = result.fuse(copy)
                        result.delete()
                        result = next
                    }
                } finally {
                    copy.delete()
                }
            }
            return result!
        } catch (error) {
            result?.delete()
            throw error
        } finally {
            base.delete()
        }
    }

    private evaluateOperand(operand: SolidOperand): Shape3D {
        if (operand.kind !== 'solidReference') return this.evaluateSolid(operand)
        const artifact = this.artifacts.get(operand.name)
        if (artifact?.kind !== 'solid') {
            throw new EvaluationFault('TCD-G005', `Solid "${operand.name}" could not be built.`, operand.span)
        }
        return artifact.shape.clone()
    }

    private evaluateBoolean(expression: BooleanExpression): Shape3D {
        let result = this.evaluateOperand(expression.operands[0])
        try {
            for (const operand of expression.operands.slice(1)) {
                const tool = this.evaluateOperand(operand)
                try {
                    const next = expression.kind === 'union'
                        ? result.fuse(tool)
                        : expression.kind === 'cut'
                            ? result.cut(tool)
                            : result.intersect(tool)
                    result.delete()
                    result = next
                    this.validateSolid(result, expression.span)
                } finally {
                    tool.delete()
                }
            }
            return result
        } catch (error) {
            result.delete()
            throw error
        }
    }

    private solidInputs(expression: SolidExpression): string[] {
        if (expression.kind === 'extrude' || expression.kind === 'revolve') return [expression.profile]
        if (expression.kind === 'pattern-circular') {
            return expression.operand.kind === 'solidReference'
                ? [expression.operand.name] : this.solidInputs(expression.operand)
        }
        return [...new Set(expression.operands.flatMap((operand) => (
            operand.kind === 'solidReference' ? [operand.name] : this.solidInputs(operand)
        )))]
    }

    private countSolids(shape: Shape3D): number {
        const solids = shape.solids
        try {
            return solids.length
        } finally {
            for (const solid of solids) solid.delete()
        }
    }

    private validateSolid(shape: Shape3D, span: SourceSpan) {
        if (shape.isNull || this.countSolids(shape) === 0
            || Math.abs(measureVolume(shape)) <= this.tolerance ** 3) {
            throw new EvaluationFault(
                'TCD-G006',
                'Operation produced no solid volume. Check whether the operands overlap or the cut removes the entire body.',
                span,
            )
        }
        const checker = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false)
        try {
            if (!checker.IsValid()) {
                throw new EvaluationFault('TCD-G007', 'CAD operation produced invalid topology or self-intersecting geometry.', span)
            }
        } finally {
            checker.delete()
        }
    }

    private validateLineProfile(profile: ProfileExpression) {
        if (!profile.curves.every((curve) => curve.kind === 'line')) return
        const segments = profile.curves.map((curve) => ({
            start: this.evaluatePoint(curve.start), end: this.evaluatePoint(curve.end),
        }))
        const orientation = (a: Point2, b: Point2, c: Point2) => (
            (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        )
        const onSegment = (a: Point2, b: Point2, p: Point2) => (
            Math.abs(orientation(a, b, p)) <= this.tolerance
            && p[0] >= Math.min(a[0], b[0]) - this.tolerance
            && p[0] <= Math.max(a[0], b[0]) + this.tolerance
            && p[1] >= Math.min(a[1], b[1]) - this.tolerance
            && p[1] <= Math.max(a[1], b[1]) + this.tolerance
        )
        for (let i = 0; i < segments.length; i += 1) {
            const { start: a, end: b } = segments[i]
            for (let j = i + 2; j < segments.length; j += 1) {
                if (i === 0 && j === segments.length - 1) continue
                const { start: c, end: d } = segments[j]
                const crosses = orientation(a, b, c) * orientation(a, b, d) < 0
                    && orientation(c, d, a) * orientation(c, d, b) < 0
                if (crosses || onSegment(a, b, c) || onSegment(a, b, d)
                    || onSegment(c, d, a) || onSegment(c, d, b)) {
                    throw new EvaluationFault('TCD-G003', 'Profile contains intersecting non-adjacent line segments.', profile.span)
                }
            }
        }
    }

    private evaluateLength(expression: LengthExpression): number {
        if (expression.kind === 'scalarLiteral') {
            return expression.value
        }

        const parameter = this.parameters.get(expression.name)
        if (!parameter) {
            throw new EvaluationFault(
                'TCD-G005',
                `Parameter "${expression.name}" has no evaluated value.`,
                expression.span,
            )
        }

        return parameter.value
    }

    private evaluatePoint(expression: Point2Expression): Point2 {
        return [
            this.evaluateLength(expression.values[0]),
            this.evaluateLength(expression.values[1]),
        ]
    }

    private curveStart(curve: CurveExpression): Point2 {
        if (curve.kind === 'circle') {
            return this.evaluatePoint(curve.center)
        }
        return this.evaluatePoint(curve.start)
    }

    private validateArc(start: Point2, middle: Point2, end: Point2, curve: ArcExpression) {
        const twiceArea = (middle[0] - start[0]) * (end[1] - start[1])
            - (middle[1] - start[1]) * (end[0] - start[0])

        if (Math.abs(twiceArea) <= this.tolerance) {
            throw new EvaluationFault(
                'TCD-G004',
                'Arc points must not be collinear.',
                curve.span,
            )
        }
    }

    private pointsEqual(first: Point2, second: Point2): boolean {
        return Math.hypot(first[0] - second[0], first[1] - second[1]) <= this.tolerance
    }

    private captureError(error: unknown, fallbackSpan: SourceSpan) {
        if (error instanceof EvaluationFault) {
            this.diagnostics.push(createGeometryDiagnostic(
                error.code,
                error.message,
                error.span,
                this.revisionId,
            ))
            return
        }

        const message = error instanceof Error
            ? `CAD kernel failed to build the operation: ${error.message}`
            : 'CAD kernel failed to build the operation.'
        this.diagnostics.push(createGeometryDiagnostic(
            'TCD-G005',
            message,
            fallbackSpan,
            this.revisionId,
        ))
    }
}

export function evaluateTextCad(
    program: SemanticProgram,
    options: EvaluationOptions = {},
): EvaluationResult {
    return new Evaluator(program, options).evaluate()
}

export type {
    ArcExpression,
    LineExpression,
}
