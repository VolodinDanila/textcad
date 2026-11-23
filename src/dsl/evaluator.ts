import {
    draw,
    drawCircle,
    drawEllipse,
    Sketch,
    sketchCircle,
    Plane,
    EdgeFinder,
    FaceFinder,
    Vertex,
    Vector,
    iterTopo,
    loft,
    genericSweep,
    makeHelix,
    makeCylinder,
    makeSolid,
    Shell,
    type Edge,
    type Face,
    type Wire,
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
    BasePlane,
    PlaneOperand,
    Point3Expression,
    SelectionExpression,
    TransformExpression,
    LinearPatternExpression,
    LoftExpression,
    FinishExpression,
    HoleExpression,
    ThreadExpression,
} from './semantic.ts'
import { isSolidExpression } from './semantic.ts'

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
    plane: BasePlane
    frame: PlaneFrame
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

export type EvaluatedArtifact = EvaluatedSketchArtifact | EvaluatedSolidArtifact | {
    kind: 'construction'; name: string; type: string; sourceId: string
}

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
type Point3 = [number, number, number]
type PlaneFrame = { origin: Point3; normal: Point3; xDirection: Point3 }
type SimpleCurve = Exclude<CurveExpression, { kind: 'polyline' | 'polygon' } | { kind: 'rectangle' }>
type SimpleProfile = Omit<ProfileExpression, 'curves'> & { curves: SimpleCurve[] }

type ParameterValue = {
    value: number
    unit: 'mm' | 'deg' | null
}

const PLANE_NORMALS: Record<BasePlane, Point3> = {
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
                if (!isSolidExpression(binding.expression)) {
                    const expression = binding.expression
                    if (expression.kind === 'point2') this.evaluatePoint(expression)
                    else if (expression.kind === 'point3' || expression.kind === 'vertexPoint') this.evaluatePoint3(expression)
                    else if (expression.kind === 'plane') this.planeFrame(expression)
                    else this.selected(expression).forEach((item) => item.delete())
                    this.artifacts.set(binding.name, { kind: 'construction', name: binding.name, type: expression.kind, sourceId: expression.sourceId })
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
                    count: expression.kind === 'pattern-circular' || expression.kind === 'pattern-linear' ? this.evaluateLength(expression.count) : undefined,
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

        const frame = this.planeFrame(expression.plane, expression.origin)
        return {
            kind: 'sketch',
            name,
            drawing,
            plane: typeof expression.plane === 'string' ? expression.plane : expression.plane.base,
            frame,
            origin: frame.origin,
            sourceId: expression.sourceId,
        }
    }

    private evaluateProfile(input: ProfileExpression): Drawing {
        const profile = this.expandProfile(input)
        const circle = profile.curves.find(({ kind }) => kind === 'circle' || kind === 'ellipse')
        if (circle) {
            if (profile.curves.length !== 1) {
                throw new EvaluationFault(
                    'TCD-G004',
                    'A circle or ellipse must be the only curve in its profile.',
                    profile.span,
                )
            }

            if (circle.kind === 'ellipse') {
                const x = this.positive(circle.radiusX, circle.span, 'Ellipse radius-x')
                const y = this.positive(circle.radiusY, circle.span, 'Ellipse radius-y')
                return drawEllipse(x, y).rotate(this.evaluateLength(circle.angle)).translate(this.evaluatePoint(circle.center))
            }
            if (circle.kind !== 'circle') throw new EvaluationFault('TCD-G004', 'Invalid closed curve.', circle.span)
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

        const sketch = this.sketchFor(profile)
        let shape: Shape3D | undefined
        try {
            shape = sketch.extrude(distance).asShape3D()
            if (expression.symmetric) {
                const normal = profile.frame.normal
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
        let shape: Shape3D
        switch (expression.kind) {
            case 'extrude': shape = this.evaluateExtrude(expression); break
            case 'revolve': shape = this.evaluateRevolve(expression); break
            case 'pattern-circular': shape = this.evaluateCircularPattern(expression); break
            case 'pattern-linear': shape = this.evaluateLinearPattern(expression); break
            case 'translate': case 'rotate': case 'scale': case 'mirror': shape = this.evaluateTransform(expression); break
            case 'loft': shape = this.evaluateLoft(expression); break
            case 'fillet': case 'chamfer': case 'shell': shape = this.evaluateFinish(expression); break
            case 'hole': shape = this.evaluateHole(expression); break
            case 'thread': shape = this.evaluateThread(expression); break
            default: shape = this.evaluateBoolean(expression)
        }
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
        const origin = this.evaluatePoint3(expression.origin)
        const sketch = this.sketchFor(profile)
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
        const origin = this.evaluatePoint3(expression.origin)
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

    private positive(expression: LengthExpression, span: SourceSpan, name: string): number {
        const value = this.evaluateLength(expression)
        if (!Number.isFinite(value) || value <= this.tolerance) throw new EvaluationFault('TCD-G004', `${name} must be finite and greater than zero.`, span)
        return value
    }

    private evaluatePoint3(expression?: Point3Expression): Point3 {
        if (!expression) return [0, 0, 0]
        if (expression.kind === 'vertexPoint') {
            const vertices = this.selected(expression.selection)
            try {
                if (vertices.length !== 1 || !(vertices[0] instanceof Vertex)) throw new EvaluationFault('TCD-G004', 'A point requires exactly one selected vertex.', expression.span)
                return vertices[0].asTuple()
            } finally { vertices.forEach((vertex) => vertex.delete()) }
        }
        return expression.values.map((value) => this.evaluateLength(value)) as Point3
    }

    private planeFrame(operand: PlaneOperand, originOverride?: Point3Expression): PlaneFrame {
        if (typeof operand === 'string') {
            return { origin: this.evaluatePoint3(originOverride), normal: PLANE_NORMALS[operand], xDirection: operand === 'YZ' ? [0, 1, 0] : [1, 0, 0] }
        }
        const frame = this.planeFrame(operand.base)
        if (operand.face) {
            const faces = this.selected(operand.face)
            try {
                if (faces.length !== 1 || !('geomType' in faces[0]) || faces[0].geomType !== 'PLANE') {
                    throw new EvaluationFault('TCD-G004', 'A working plane requires exactly one planar face.', operand.span)
                }
                const face = faces[0] as Face
                const normal = face.normalAt()
                const center = face.center
                try { frame.normal = normal.toTuple(); frame.origin = center.toTuple() } finally { normal.delete(); center.delete() }
                // Pick a stable in-plane X direction, independent of topological indices.
                frame.xDirection = Math.abs(frame.normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
            } finally { faces.forEach((face) => face.delete()) }
        }
        if (operand.normal) {
            frame.normal = this.axisDirection(operand.normal, operand.span)
            if (!operand.xDirection) frame.xDirection = Math.abs(frame.normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
        }
        if (operand.xDirection) frame.xDirection = this.axisDirection(operand.xDirection, operand.span)
        const projection = frame.xDirection.reduce((sum, value, index) => sum + value * frame.normal[index], 0)
        const x = frame.xDirection.map((value, index) => value - projection * frame.normal[index]) as Point3
        const magnitude = Math.hypot(...x)
        if (magnitude <= this.tolerance) throw new EvaluationFault('TCD-G004', 'Plane x-direction must not be parallel to its normal.', operand.span)
        frame.xDirection = x.map((value) => value / magnitude) as Point3
        if (operand.origin) frame.origin = this.evaluatePoint3(operand.origin)
        const offset = this.evaluateLength(operand.offset)
        frame.origin = frame.origin.map((value, index) => value + offset * frame.normal[index]) as Point3
        if (originOverride) frame.origin = this.evaluatePoint3(originOverride)
        return frame
    }

    private sketchFor(profile: EvaluatedSketchArtifact) {
        const plane = new Plane(profile.frame.origin, profile.frame.xDirection, profile.frame.normal)
        try { return profile.drawing.sketchOnPlane(plane) } finally { plane.delete() }
    }

    private expandProfile(profile: ProfileExpression): SimpleProfile {
        const curves: SimpleCurve[] = []
        const point = (value: Point2): Point2Expression => ({ kind: 'point2', values: value.map((n) => ({ kind: 'scalarLiteral', value: n, unit: 'mm', sourceId: profile.sourceId, span: profile.span })) as Point2Expression['values'], sourceId: profile.sourceId, span: profile.span })
        for (const curve of profile.curves) {
            if (curve.kind === 'rectangle' || curve.kind === 'polyline' || curve.kind === 'polygon') {
                let points: Point2[]
                if (curve.kind === 'rectangle') {
                    const [x, y] = this.evaluatePoint(curve.origin)
                    const width = this.positive(curve.width, curve.span, 'Rectangle width')
                    const height = this.positive(curve.height, curve.span, 'Rectangle height')
                    points = [[x, y], [x + width, y], [x + width, y + height], [x, y + height], [x, y]]
                } else {
                    points = curve.points.map((p) => this.evaluatePoint(p))
                    if (curve.closed && !this.pointsEqual(points[0], points[points.length - 1])) points.push(points[0])
                }
                for (let index = 1; index < points.length; index += 1) {
                    if (this.pointsEqual(points[index - 1], points[index])) throw new EvaluationFault('TCD-G004', 'Consecutive polyline vertices must be distinct.', curve.span)
                    curves.push({ kind: 'line', start: point(points[index - 1]), end: point(points[index]), sourceId: curve.sourceId, span: curve.span })
                }
            } else if (curve.kind === 'line' || curve.kind === 'arc' || curve.kind === 'circle' || curve.kind === 'ellipse') curves.push(curve)
        }
        return { ...profile, curves }
    }

    private selected(expression: SelectionExpression): (Edge | Face | Vertex)[] {
        const artifact = this.artifacts.get(expression.body)
        if (artifact?.kind !== 'solid') throw new EvaluationFault('TCD-G005', `Selection body "${expression.body}" could not be built.`, expression.span)
        let elements: (Edge | Face | Vertex)[] = expression.kind === 'edges' ? artifact.shape.edges
            : expression.kind === 'faces' ? artifact.shape.faces : [...iterTopo(artifact.shape.wrapped, 'vertex')].map((vertex) => new Vertex(vertex))
        try {
            // Topological explorers can visit shared vertices more than once.
            if (expression.kind === 'vertices') {
                const unique: typeof elements = []
                for (const element of elements) {
                    if (unique.some((other) => other.isSame(element))) element.delete()
                    else unique.push(element)
                }
                elements = unique
            }
            const axis = expression.axis ? this.axisDirection(expression.axis, expression.span) : undefined
            const near = expression.near ? this.evaluatePoint3(expression.near) : undefined
            const within = expression.within ? this.positive(expression.within, expression.span, 'Selection within') : undefined
            const length = expression.length ? this.positive(expression.length, expression.span, 'Edge length') : undefined
            const center = (element: Edge | Face | Vertex): Point3 => {
                if (element instanceof Vertex) return element.asTuple()
                const box = element.boundingBox
                try { return box.center } finally { box.delete() }
            }
            const candidates = elements.filter((element) => {
                const geometry = 'geomType' in element ? element.geomType.toLowerCase().replace(/_(curve|surface)$/, '').replace('cylindre', 'cylinder') : undefined
                if (expression.geometry && geometry !== expression.geometry) return false
                if (length !== undefined && (!('length' in element) || Math.abs(element.length - length) > this.tolerance)) return false
                if (axis && !expression.extreme) {
                    if (element instanceof Vertex) return false
                    if (expression.kind === 'edges' && element.geomType !== 'LINE') return false
                    if (expression.kind === 'faces' && element.geomType !== 'PLANE') return false
                    const direction = 'normalAt' in element ? element.normalAt() : element.tangentAt()
                    try {
                        const tuple = direction.toTuple()
                        const dot = tuple.reduce((sum, value, index) => sum + value * axis[index], 0) / Math.hypot(...tuple)
                        if (Math.abs(Math.abs(dot) - 1) > this.tolerance) return false
                    } finally { direction.delete() }
                }
                if (near && within !== undefined && Math.hypot(...center(element).map((value, index) => value - near[index])) > within + this.tolerance) return false
                return true
            })
            let selected = candidates
            if (expression.extreme && axis && candidates.length) {
                const projections = candidates.map((element) => center(element).reduce((sum, value, index) => sum + value * axis[index], 0))
                const extreme = expression.extreme === 'min' ? Math.min(...projections) : Math.max(...projections)
                selected = candidates.filter((_, index) => Math.abs(projections[index] - extreme) <= this.tolerance)
            }
            if (!selected.length) throw new EvaluationFault('TCD-G004', `${expression.kind} selection matched no elements.`, expression.span)
            const retained = new Set(selected)
            for (const element of elements) if (!retained.has(element)) element.delete()
            return selected
        } catch (error) { elements.forEach((element) => element.delete()); throw error }
    }

    private evaluateTransform(expression: TransformExpression): Shape3D {
        let shape = this.evaluateOperand(expression.operand)
        try {
            if (expression.kind === 'translate') shape = shape.translate(this.evaluatePoint3(expression.vector))
            else if (expression.kind === 'rotate') shape = shape.rotate(this.evaluateLength(expression.angle), this.evaluatePoint3(expression.origin), this.axisDirection(expression.axis, expression.span))
            else if (expression.kind === 'scale') shape = shape.scale(this.positive(expression.factor, expression.span, 'Scale factor'), this.evaluatePoint3(expression.origin))
            else {
                const frame = this.planeFrame(expression.plane, expression.origin)
                const plane = new Plane(frame.origin, frame.xDirection, frame.normal)
                try { shape = shape.mirror(plane) } finally { plane.delete() }
            }
            return shape
        } catch (error) { shape.delete(); throw error }
    }

    private evaluateLinearPattern(expression: LinearPatternExpression): Shape3D {
        const count = this.evaluateLength(expression.count)
        const spacing = this.evaluateLength(expression.spacing)
        if (!Number.isInteger(count) || count < 1 || count > 128 || Math.abs(spacing) <= this.tolerance) throw new EvaluationFault('TCD-G004', 'pattern-linear requires count 1..128 and non-zero spacing.', expression.span)
        const axis = this.axisDirection(expression.axis, expression.span)
        const base = this.evaluateOperand(expression.operand)
        let result = base.clone()
        try {
            for (let index = 1; index < count; index += 1) {
                const copy = base.clone().translate(axis.map((value) => value * spacing * index) as Point3)
                try { const next = result.fuse(copy); result.delete(); result = next } finally { copy.delete() }
            }
            return result
        } catch (error) { result.delete(); throw error } finally { base.delete() }
    }

    private evaluateLoft(expression: LoftExpression): Shape3D {
        const sections: { outer: Wire; holes: Wire[]; face: Face }[] = []
        const shells: Shell[] = []
        let result: Shape3D | undefined
        try {
            for (const name of expression.profiles) {
                const profile = this.artifacts.get(name)
                if (profile?.kind !== 'sketch') throw new EvaluationFault('TCD-G005', `Loft sketch "${name}" could not be built.`, expression.span)
                const sketch = this.sketchFor(profile)
                try {
                    const section = sketch instanceof Sketches && sketch.sketches.length === 1 ? sketch.sketches[0] : sketch
                    if (section instanceof Sketches) throw new EvaluationFault('TCD-G004', 'Each loft section must have one connected outer region; holes are supported.', expression.span)
                    const face = section.face()
                    // Replicad's wire extraction consumes the face wrapper.
                    const outer = face.clone().outerWire()
                    const holes = face.clone().innerWires()
                    const localCenter = (wire: Wire): Point2 => {
                        const box = wire.boundingBox
                        const plane = new Plane(profile.frame.origin, profile.frame.xDirection, profile.frame.normal)
                        const center = new Vector(box.center)
                        try {
                            const point = plane.toLocalCoords(center)
                            try { const [x, y] = point.toTuple(); return [x, y] } finally { point.delete() }
                        } finally { center.delete(); box.delete(); plane.delete() }
                    }
                    holes.sort((a, b) => {
                        const first = localCenter(a); const second = localCenter(b)
                        return Math.abs(first[0] - second[0]) > this.tolerance ? first[0] - second[0] : first[1] - second[1]
                    })
                    sections.push({ outer, holes, face })
                } finally {
                    if (sketch instanceof Sketches) sketch.sketches.forEach((item) => item.delete())
                    else if ('delete' in sketch && typeof sketch.delete === 'function') sketch.delete()
                }
            }
            if (sections.some((section) => section.holes.length !== sections[0].holes.length)) throw new EvaluationFault('TCD-G004', 'Loft sections must have the same number of holes, in corresponding order.', expression.span)
            if (sections[0].holes.length === 0) return loft(sections.map((section) => section.outer), { ruled: expression.ruled })
            // Sew outer and inner skins with annular caps. Cutting independent solid
            // lofts can fail at coincident circular seams in multi-section lofts.
            for (let index = -1; index < sections[0].holes.length; index += 1) {
                const skin = loft(sections.map((section) => index < 0 ? section.outer : section.holes[index]), { ruled: expression.ruled }, true)
                if (!(skin instanceof Shell)) { skin.delete(); throw new EvaluationFault('TCD-G005', 'Loft did not produce a connected skin.', expression.span) }
                shells.push(skin)
            }
            result = makeSolid([...shells, sections[0].face, sections[sections.length - 1].face])
            return result!
        } catch (error) { result?.delete(); throw error } finally {
            for (const shell of shells) shell.delete()
            for (const section of sections) { section.outer.delete(); section.holes.forEach((hole) => hole.delete()); section.face.delete() }
        }
    }

    private evaluateFinish(expression: FinishExpression): Shape3D {
        const size = this.positive(expression.size, expression.span, expression.kind === 'shell' ? 'Shell thickness' : 'Finish size')
        const shape = this.evaluateOperand(expression.operand)
        let elements: (Edge | Face | Vertex)[] = []
        try {
            elements = this.selected(expression.selection)
            const target = expression.kind === 'shell' ? shape.faces : shape.edges
            try {
                if (elements.some((element) => !target.some((candidate) => candidate.isSame(element)))) throw new EvaluationFault('TCD-G004', 'Selected elements must belong to the operation input; select from that body.', expression.span)
            } finally { target.forEach((element) => element.delete()) }
            if (expression.kind === 'shell') {
                const finder = new FaceFinder().inList(elements as Face[])
                try { return shape.shell({ filter: finder, thickness: size }) } finally { finder.delete() }
            }
            const finder = new EdgeFinder().inList(elements as Edge[])
            try { return expression.kind === 'fillet' ? shape.fillet({ radius: size, filter: finder, keep: true }) : shape.chamfer({ radius: size, filter: finder, keep: true }) } finally { finder.delete() }
        } finally { elements.forEach((element) => element.delete()); shape.delete() }
    }

    private cutFeature(shape: Shape3D, tool: Shape3D, span: SourceSpan): Shape3D {
        const before = Math.abs(measureVolume(shape))
        const result = shape.cut(tool)
        if (before - Math.abs(measureVolume(result)) <= Math.max(this.tolerance ** 3, before * 1e-10)) {
            result.delete()
            throw new EvaluationFault('TCD-G004', 'The cutting feature does not remove material from its input body. Check its origin, axis and dimensions.', span)
        }
        return result
    }

    private evaluateHole(expression: HoleExpression): Shape3D {
        const axis = this.axisDirection(expression.axis, expression.span)
        const origin = this.evaluatePoint3(expression.origin)
        const radius = this.positive(expression.radius, expression.span, 'Hole radius')
        let shape = this.evaluateOperand(expression.operand)
        const box = shape.boundingBox
        let depth: number
        let start = origin
        try {
            if (expression.through) {
                const [min, max] = box.bounds
                const projections: number[] = []
                for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) projections.push([x, y, z].reduce((sum, value, i) => sum + (value - origin[i]) * axis[i], 0))
                const low = Math.min(...projections) - 1
                depth = Math.max(...projections) - low + 1
                start = origin.map((value, i) => value + low * axis[i]) as Point3
            } else depth = this.positive(expression.depth!, expression.span, 'Hole depth')
            const tool = makeCylinder(radius, depth, start, axis)
            try { const next = this.cutFeature(shape, tool, expression.span); shape.delete(); shape = next } finally { tool.delete() }
            if (expression.counterboreRadius && expression.counterboreDepth) {
                const r = this.positive(expression.counterboreRadius, expression.span, 'Counterbore radius')
                const d = this.positive(expression.counterboreDepth, expression.span, 'Counterbore depth')
                if (r <= radius || (!expression.through && d > depth)) throw new EvaluationFault('TCD-G004', 'Counterbore radius must exceed hole radius and its depth must fit the hole.', expression.span)
                const bore = makeCylinder(r, d, origin, axis)
                try { const next = this.cutFeature(shape, bore, expression.span); shape.delete(); shape = next } finally { bore.delete() }
            }
            if (expression.countersinkRadius) {
                const r = this.positive(expression.countersinkRadius, expression.span, 'Countersink radius')
                const angle = this.evaluateLength(expression.countersinkAngle)
                if (r <= radius || angle <= 0 || angle >= 180) throw new EvaluationFault('TCD-G004', 'Countersink requires a larger radius and an included angle between 0 and 180deg.', expression.span)
                const d = (r - radius) / Math.tan(angle * Math.PI / 360)
                if (!expression.through && d > depth) throw new EvaluationFault('TCD-G004', 'Countersink depth exceeds hole depth.', expression.span)
                const normalPlane = new Plane(origin, null, axis)
                const upperPlane = new Plane(origin.map((value, i) => value + d * axis[i]) as Point3, null, axis)
                const a = sketchCircle(r, { plane: normalPlane })
                const b = sketchCircle(radius, { plane: upperPlane })
                try {
                    const cone = loft([a.wire, b.wire], { ruled: true })
                    try { const next = this.cutFeature(shape, cone, expression.span); shape.delete(); shape = next } finally { cone.delete() }
                } finally { a.delete(); b.delete(); normalPlane.delete(); upperPlane.delete() }
            }
            return shape
        } catch (error) { shape.delete(); throw error } finally { box.delete() }
    }

    private evaluateThread(expression: ThreadExpression): Shape3D {
        const radius = this.positive(expression.radius, expression.span, 'Thread radius')
        const pitch = this.positive(expression.pitch, expression.span, 'Thread pitch')
        const length = this.positive(expression.length, expression.span, 'Thread length')
        const depth = this.positive(expression.depth, expression.span, 'Thread depth')
        if (length / pitch > 64 || depth >= radius || depth > pitch * 0.7) throw new EvaluationFault('TCD-G004', 'Thread supports at most 64 turns, depth < radius and depth <= 0.7*pitch.', expression.span)
        const axis = this.axisDirection(expression.axis, expression.span)
        const origin = this.evaluatePoint3(expression.origin)
        const shape = this.evaluateOperand(expression.operand)
        const epsilon = Math.max(1e-4, depth * 0.01)
        const root = radius + (expression.internal ? depth : -depth)
        const outside = radius + (expression.internal ? -epsilon : epsilon)
        const half = depth / Math.sqrt(3) + pitch / 32
        let profile: Sketch | undefined
        let helix: Wire | undefined
        let tool: Shape3D | undefined
        try {
            const section = draw([outside, -pitch - half])
                .lineTo([root, -pitch - pitch / 32])
                .lineTo([root, -pitch + pitch / 32])
                .lineTo([outside, -pitch + half]).close().sketchOnPlane('XZ')
            if (!(section instanceof Sketch)) throw new EvaluationFault('TCD-G005', 'Could not construct the thread cutting profile.', expression.span)
            profile = section
            helix = makeHelix(pitch, length + 2 * pitch, radius, [0, 0, -pitch], [0, 0, 1], expression.leftHanded)
            tool = genericSweep(profile.wire, helix, { frenet: true, forceProfileSpineOthogonality: false })
            const clip = makeCylinder(radius + depth + 1, length)
            try { const trimmed = tool.intersect(clip); tool.delete(); tool = trimmed } finally { clip.delete() }
            const cross: Point3 = [-axis[1], axis[0], 0]
            const angle = Math.acos(Math.max(-1, Math.min(1, axis[2]))) * 180 / Math.PI
            if (Math.hypot(...cross) > this.tolerance) tool = tool.rotate(angle, [0, 0, 0], cross)
            else if (axis[2] < 0) tool = tool.rotate(180, [0, 0, 0], [1, 0, 0])
            tool = tool.translate(origin)
            return this.cutFeature(shape, tool, expression.span)
        } finally { tool?.delete(); profile?.delete(); helix?.delete(); shape.delete() }
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
        if (expression.kind === 'loft') return expression.profiles
        if ('operand' in expression) {
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

    private validateLineProfile(profile: SimpleProfile) {
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

    private curveStart(curve: SimpleCurve): Point2 {
        if (curve.kind === 'circle' || curve.kind === 'ellipse') {
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
