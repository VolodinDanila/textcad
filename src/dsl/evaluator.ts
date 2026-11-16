import {
    draw,
    drawCircle,
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
    CurveExpression,
    ExtrudeExpression,
    LengthExpression,
    LineExpression,
    Point2Expression,
    ProfileExpression,
    SemanticProgram,
    SketchExpression,
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
    sourceId: string
}

export type EvaluatedSolidArtifact = {
    kind: 'solid'
    name: string
    shape: Shape3D
    operation: 'extrude'
    distance: number
    sourceId: string
}

export type EvaluatedArtifact = EvaluatedSketchArtifact | EvaluatedSolidArtifact

export type EvaluatedRoot = {
    name: string
    label: string | null
    shape: Shape3D
    sourceId: string
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

                const artifact = this.evaluateExtrude(binding.name, binding.expression)
                if (artifact) {
                    this.artifacts.set(binding.name, artifact)
                }
            } catch (error) {
                this.captureError(error, binding.expression.span)
            }
        }

        const roots: EvaluatedRoot[] = []
        for (const root of this.program.roots) {
            const artifact = this.artifacts.get(root.reference)
            if (artifact?.kind !== 'solid') {
                continue
            }

            roots.push({
                name: root.reference,
                label: root.label,
                shape: artifact.shape,
                sourceId: root.sourceId,
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

        return pen.close()
    }

    private evaluateExtrude(
        name: string,
        expression: ExtrudeExpression,
    ): EvaluatedSolidArtifact | null {
        const profile = this.artifacts.get(expression.profile)
        if (profile?.kind !== 'sketch') {
            return null
        }

        const distance = this.evaluateLength(expression.length)
        if (Math.abs(distance) <= this.tolerance) {
            throw new EvaluationFault(
                'TCD-G005',
                'Extrusion length must not be zero.',
                expression.span,
            )
        }

        const sketch = profile.drawing.sketchOnPlane(profile.plane)
        let shape = sketch.extrude(distance).asShape3D()

        if (expression.symmetric) {
            const normal = PLANE_NORMALS[profile.plane]
            shape = shape.translate(
                normal[0] * -distance / 2,
                normal[1] * -distance / 2,
                normal[2] * -distance / 2,
            )
        }

        return {
            kind: 'solid',
            name,
            shape,
            operation: 'extrude',
            distance,
            sourceId: expression.sourceId,
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
