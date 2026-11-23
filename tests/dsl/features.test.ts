import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import opencascade from 'replicad-opencascadejs'
import { measureVolume, setOC } from 'replicad'
import { evaluateTextCad, type EvaluationResult } from '../../src/dsl/evaluator.ts'
import { parseTextCad } from '../../src/dsl/parser.ts'
import { analyzeTextCad } from '../../src/dsl/semantic.ts'
import { meshCadModels } from '../../src/cad/meshCadModel.ts'

setOC(await opencascade())
const header = '[textcad version=1 default-length=mm default-angle=deg]'
const cube = `[let sketch [sketch plane=XY [profile [rectangle origin=[0mm 0mm] width=10mm height=10mm]]]]
    [let base [extrude sketch length=10mm]]`
const cylinder = `[let sketch [sketch plane=XY [profile [circle center=[0mm 0mm] radius=5mm]]]]
    [let base [extrude sketch length=8mm]]`

function analyze(source: string) {
    const parsed = parseTextCad(source)
    assert.deepEqual(parsed.diagnostics, [])
    return analyzeTextCad(parsed.document)
}
function evaluate(source: string) {
    const analyzed = analyze(source)
    assert.deepEqual(analyzed.diagnostics, [])
    return evaluateTextCad(analyzed.program)
}
function dispose(result: EvaluationResult) {
    for (const item of result.artifacts) if (item.kind === 'solid') item.shape.delete()
}
function valid(source: string, check: (result: EvaluationResult) => void) {
    const result = evaluate(source)
    try { assert.deepEqual(result.diagnostics, []); check(result) } finally { dispose(result) }
}
function volume(result: EvaluationResult, name?: string) {
    if (!name) return measureVolume(result.roots[0].shape)
    const artifact = result.artifacts.find((item) => item.name === name)
    assert.equal(artifact?.kind, 'solid')
    return artifact?.kind === 'solid' ? measureVolume(artifact.shape) : NaN
}
function close(actual: number, expected: number, tolerance = 1e-5) {
    assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`)
}
function bounds(result: EvaluationResult) {
    const box = result.roots[0].shape.boundingBox
    try { return box.bounds } finally { box.delete() }
}

test('rectangle, polygon and open/closed polylines create exact prismatic volumes', () => {
    for (const curve of [
        '[rectangle origin=[0mm 0mm] width=10mm height=6mm]',
        '[polygon [0mm 0mm] [10mm 0mm] [10mm 6mm] [0mm 6mm]]',
        '[polyline closed=true [0mm 0mm] [10mm 0mm] [10mm 6mm] [0mm 6mm]]',
        '[polyline [0mm 0mm] [10mm 0mm] [10mm 6mm]] [polyline [10mm 6mm] [0mm 6mm] [0mm 0mm]]',
    ]) valid(`${header} [let s [sketch plane=XY [profile ${curve}]]] [let b [extrude s length=4mm]] [root b]`, (result) => close(volume(result), 240))
})

test('ellipse radii, angle, hole subtraction and named 2D points work', () => {
    valid(`${header} [param x 3mm] [let c [point [x 2mm]]]
        [let s [sketch plane=XY [profile [ellipse center=c radius-x=5mm radius-y=3mm angle=30deg]]
        [profile role=hole [ellipse center=c radius-x=2mm radius-y=1mm]]]]
        [let b [extrude s length=2mm]] [root b]`, (result) => close(volume(result), Math.PI * 26))
})

test('named points and arbitrary working planes preserve handedness and symmetric extrusion', () => {
    valid(`${header} [let p [point [3mm 4mm 5mm]]]
        [let w [plane origin=p normal=[0 2 0] x-direction=X offset=2mm]]
        [let s [sketch plane=w [profile [rectangle origin=[0mm 0mm] width=10mm height=6mm]]]]
        [let b [extrude s length=4mm symmetric=true]] [root b]`, (result) => {
        close(volume(result), 240)
        const [min, max] = bounds(result)
        min.forEach((value, i) => close(value, [3, 4, -1][i], 1e-5))
        max.forEach((value, i) => close(value, [13, 8, 5][i], 1e-5))
    })
})

test('face selections define sketch-on-face planes with a predictable normal and offset', () => {
    valid(`${header} ${cube}
        [let top [faces base type=plane axis=Z extreme=max]]
        [let w [plane face=top offset=2mm]]
        [let s [sketch plane=w [profile [circle center=[0mm 0mm] radius=1mm]]]]
        [let boss [extrude s length=3mm]] [root boss]`, (result) => {
        close(volume(result), Math.PI * 3)
        const [min, max] = bounds(result)
        close(min[2], 12); close(max[2], 15)
        close(volume(result, 'base'), 1000)
    })
})

test('vertices select a unique reusable world point and reject ambiguity', () => {
    valid(`${header} ${cube}
        [let corner [vertices base near=[10mm 10mm 10mm] within=0.1mm]]
        [let p [point corner]]
        [let moved [translate base vector=p]] [root moved]`, (result) => {
        const [min, max] = bounds(result)
        min.forEach((value) => close(value, 10)); max.forEach((value) => close(value, 20))
        close(volume(result, 'base'), 1000)
    })
    const result = evaluate(`${header} ${cube} [let p [point [vertices base axis=Z extreme=max]]] [root base]`)
    try { assert.ok(result.diagnostics.some((item) => item.message.includes('exactly one'))) } finally { dispose(result) }
})

for (const operation of [
    '[translate base vector=[10mm 20mm 30mm]]',
    '[rotate base axis=Z angle=90deg origin=[0mm 0mm 0mm]]',
    '[mirror base plane=YZ]',
    '[scale base factor=2 origin=[0mm 0mm 0mm]]',
]) test(`immutable transform ${operation}`, () => {
    valid(`${header} ${cube} [let changed ${operation}] [root changed]`, (result) => {
        close(volume(result, 'base'), 1000)
        close(volume(result), operation.includes('scale') ? 8000 : 1000)
        const [min, max] = bounds(result)
        const expected = operation.includes('translate') ? [[10, 20, 30], [20, 30, 40]]
            : operation.includes('rotate') ? [[-10, 0, 0], [0, 10, 10]]
            : operation.includes('mirror') ? [[-10, 0, 0], [0, 10, 10]] : [[0, 0, 0], [20, 20, 20]]
        min.forEach((value, i) => close(value, expected[0][i])); max.forEach((value, i) => close(value, expected[1][i]))
    })
})

test('linear patterns preserve separate copies and fuse overlaps, including negative spacing', () => {
    for (const [spacing, expected, solids] of [[15, 3000, 3], [5, 2000, 1], [-15, 3000, 3], [5, 1000, 1]]) {
        const count = expected === 1000 ? 1 : 3
        valid(`${header} ${cube} [let copies [pattern-linear base axis=X spacing=${spacing}mm count=${count}]] [root copies]`, (result) => {
            close(volume(result), expected); assert.equal(result.roots[0].solidCount, solids); close(volume(result, 'base'), 1000)
        })
    }
})

test('loft builds a cone frustum through three sections, including corresponding holes', () => {
    for (const holes of [false, true]) {
        const sections = [0, 5, 10].map((z, i) => `[let s${i} [sketch plane=XY origin=[0mm 0mm ${z}mm]
            [profile [circle center=[0mm 0mm] radius=${5 + i * 2.5}mm]]
            ${holes ? '[profile role=hole [circle center=[0mm 0mm] radius=1mm]]' : ''}]]`).join('\n')
        valid(`${header} ${sections} [let b [loft s0 s1 s2 ruled=true]] [root b]`, (result) => {
            close(volume(result), Math.PI * 10 / 3 * (25 + 50 + 100) - (holes ? Math.PI * 10 : 0), 1e-3)
        })
    }
})

for (const operation of ['fillet', 'chamfer']) test(`${operation} acts on selected vertical edges and preserves its input`, () => {
    valid(`${header} ${cube} [let e [edges base type=line axis=Z length=10mm]]
        [let b [${operation} base edges=e ${operation === 'fillet' ? 'radius' : 'distance'}=1mm]] [root b]`, (result) => {
        const expected = operation === 'fillet' ? 1000 - (4 - Math.PI) * 10 : 980
        close(volume(result), expected); close(volume(result, 'base'), 1000)
    })
})

test('shell removes the selected top face and offsets inward to a real open container', () => {
    valid(`${header} ${cube} [let b [shell base faces=[faces base type=plane axis=Z extreme=max] thickness=1mm]] [root b]`, (result) => {
        close(volume(result), 1000 - 8 * 8 * 9); close(volume(result, 'base'), 1000)
    })
})

for (const [spec, removed] of [
    ['depth=4mm', Math.PI * 4],
    ['through=true', Math.PI * 10],
    ['depth=8mm counterbore-radius=2mm counterbore-depth=2mm', Math.PI * 14],
    ['depth=8mm countersink-radius=2mm countersink-angle=90deg', Math.PI * (8 + 4 / 3)],
] as const) test(`hole ${spec} has the expected removed volume`, () => {
    valid(`${header} ${cube} [let b [hole base origin=[5mm 5mm 0mm] axis=Z radius=1mm ${spec}]] [root b]`, (result) => {
        close(volume(result), 1000 - removed); close(volume(result, 'base'), 1000)
    })
})

for (const internal of [false, true]) for (const left of [false, true]) test(`real ${internal ? 'internal' : 'external'} thread, left-handed=${left}`, () => {
    const bore = internal ? '[let blank [hole base origin=[0mm 0mm 0mm] radius=3mm through=true]]' : ''
    valid(`${header} ${cylinder} ${bore}
        [let b [thread ${internal ? 'blank' : 'base'} radius=${internal ? 3 : 5}mm pitch=2mm length=6mm depth=0.6mm internal=${internal} left-handed=${left}]] [root b]`, (result) => {
        const before = volume(result, internal ? 'blank' : 'base')
        assert.ok(volume(result) < before - 1)
        assert.ok(volume(result) > before * 0.5)
        assert.equal(result.roots[0].solidCount, 1)
        const mesh = meshCadModels(result.roots)
        assert.ok(mesh.triangles.length > 0)
    })
})

test('new contracts reject incorrect units, selection kinds, references and conflicting arguments', () => {
    for (const operation of [
        '[translate base vector=[0mm 1deg 0mm]]', '[rotate base angle=1mm]', '[scale base factor=1mm]',
        '[mirror base plane=missing]', '[pattern-linear base count=3mm spacing=2mm]',
        '[fillet base edges=[faces base] radius=1mm]', '[shell base faces=[edges base] thickness=1mm]',
        '[hole base origin=[0mm 0mm] radius=1mm depth=2mm]', '[hole base origin=[0mm 0mm 0mm] radius=1mm depth=2mm through=true]',
        '[hole base origin=[0mm 0mm 0mm] radius=1mm depth=2mm counterbore-radius=2mm]',
        '[thread base radius=5mm length=2mm depth=0.5mm pitch=2deg]', '[loft base sketch]',
        '[point [1mm 2deg]]', '[plane normal=[0mm 0 1]]', '[vertices base type=line]',
        '[edges base near=[0mm 0mm 0mm]]', '[faces base extreme=max]',
    ]) {
        const analyzed = analyze(`${header} ${cube} [let bad ${operation}] [root base]`)
        assert.ok(analyzed.diagnostics.length, operation)
    }
})

test('degenerate geometry and empty/mismatched selections return diagnostics without corrupting inputs', () => {
    for (const operation of [
        '[scale base factor=0]', '[pattern-linear base count=129 spacing=2mm]',
        '[pattern-linear base count=2 spacing=0mm]', '[rotate base angle=30deg axis=[0 0 0]]',
        '[fillet base edges=[edges base type=circle] radius=1mm]',
        '[fillet [translate base vector=[20mm 0mm 0mm]] edges=[edges base] radius=1mm]',
        '[shell base faces=[faces base] thickness=-1mm]', '[plane normal=Z x-direction=Z]',
        '[hole base origin=[100mm 100mm 0mm] radius=1mm depth=5mm]',
        '[thread base radius=5mm pitch=1mm length=65mm depth=0.5mm]',
    ]) {
        const result = evaluate(`${header} ${cube} [let bad ${operation}] [root base]`)
        try { assert.ok(result.diagnostics.length, operation); close(volume(result), 1000) } finally { dispose(result) }
    }
})

test('polygon self intersections, zero segments and open polylines are rejected', () => {
    for (const curve of [
        '[polygon [0mm 0mm] [10mm 10mm] [10mm 0mm] [0mm 10mm]]',
        '[polyline closed=true [0mm 0mm] [0mm 0mm] [10mm 10mm]]',
        '[polyline [0mm 0mm] [10mm 0mm] [10mm 10mm]]',
        '[rectangle origin=[0mm 0mm] width=0mm height=2mm]',
        '[ellipse center=[0mm 0mm] radius-x=2mm radius-y=-1mm]',
    ]) {
        const result = evaluate(`${header} [let s [sketch plane=XY [profile ${curve}]]] [let b [extrude s length=2mm]] [root b]`)
        try { assert.ok(result.diagnostics.length, curve); assert.equal(result.roots.length, 0) } finally { dispose(result) }
    }
})

test('ellipse supports the Y-major axis and points with length parameters', () => {
    valid(`${header} [param x 4mm] [param y 6mm] [let p [point [x y]]]
        [let s [sketch plane=XY [profile [ellipse center=p radius-x=2mm radius-y=5mm]]]]
        [let b [extrude s length=3mm]] [root b]`, (result) => close(volume(result), Math.PI * 30))
})

test('geometric type filters recognize cylindrical faces and circular rims', () => {
    valid(`${header} ${cylinder} [let side [faces base type=cylinder]]
        [let rim [edges base type=circle axis=Z extreme=max]]
        [let b [chamfer base edges=rim distance=0.5mm]] [root b]`, (result) => {
        assert.ok(volume(result) < volume(result, 'base'))
    })
})

test('a working plane supports an oblique mirror', () => {
    valid(`${header} ${cube}
        [let w [plane origin=[5mm 0mm 0mm] normal=[1 1 0] x-direction=Z]]
        [let b [mirror base plane=w]] [root b]`, (result) => {
        close(volume(result), 1000)
        const [min, max] = bounds(result)
        close(min[0], -5); close(max[0], 5)
        close(min[1], -5); close(max[1], 5)
        close(volume(result, 'base'), 1000)
    })
})

test('smooth loft and ordered multiple hole contours produce valid connected solids', () => {
    for (const ruled of [true, false]) {
        const sections = [0, 5, 10].map((z, index) => `[let s${index} [sketch plane=XY origin=[0mm 0mm ${z}mm]
            [profile [circle center=[0mm 0mm] radius=10mm]]
            [profile role=hole [circle center=[-4mm 0mm] radius=1mm]]
            [profile role=hole [circle center=[4mm 0mm] radius=2mm]]]]`).join('\n')
        valid(`${header} ${sections} [let b [loft s0 s1 s2 ruled=${ruled}]] [root b]`, (result) => {
            close(volume(result), Math.PI * 950, 1e-3)
            assert.equal(result.roots[0].solidCount, 1)
        })
    }
})

test('loft rejects incompatible holes, disconnected regions and coincident sections', () => {
    const a = '[let a [sketch plane=XY [profile [circle center=[0mm 0mm] radius=5mm]]]]'
    for (const b of [
        '[sketch plane=XY origin=[0mm 0mm 5mm] [profile [circle center=[0mm 0mm] radius=5mm]] [profile role=hole [circle center=[0mm 0mm] radius=1mm]]]',
        '[sketch plane=XY origin=[0mm 0mm 5mm] [profile [circle center=[0mm 0mm] radius=5mm]] [profile [circle center=[20mm 0mm] radius=5mm]]]',
        '[sketch plane=XY [profile [circle center=[0mm 0mm] radius=5mm]]]',
    ]) {
        const result = evaluate(`${header} ${a} [let b ${b}] [let c [loft a b]] [root c]`)
        try { assert.ok(result.diagnostics.length); assert.equal(result.roots.length, 0) } finally { dispose(result) }
    }
})

test('hole respects oblique world axes and reverse directions', () => {
    for (const [origin, axis] of [['[10mm 5mm 5mm]', '[-1 0 0]'], ['[5mm 5mm 10mm]', '[0 0 -2]']]) {
        valid(`${header} ${cube} [let b [hole base origin=${origin} axis=${axis} radius=1mm depth=4mm]] [root b]`, (result) => close(volume(result), 1000 - Math.PI * 4))
    }
})

test('thread follows a shifted reversed world axis and preserves the cylindrical blank', () => {
    valid(`${header} ${cylinder} [let moved [translate base vector=[10mm 20mm 30mm]]]
        [let b [thread moved origin=[10mm 20mm 38mm] axis=[0 0 -1] radius=5mm pitch=2mm length=6mm depth=0.6mm]] [root b]`, (result) => {
        close(volume(result, 'base'), Math.PI * 25 * 8)
        assert.ok(volume(result) < volume(result, 'moved') - 1)
        const [min, max] = bounds(result)
        close(min[2], 30); close(max[2], 38)
    })
})

test('full feature showcase builds and meshes all published roots', () => {
    const source = readFileSync(new URL('../../docs/dsl/examples/feature-showcase.textcad', import.meta.url), 'utf8')
    valid(source, (result) => {
        assert.equal(result.roots.length, 4)
        assert.ok(meshCadModels(result.roots).triangles.length > 0)
    })
})

test('motor bracket example builds with two ribs, repeated holes and finishing operations', () => {
    const source = readFileSync(new URL('../../docs/dsl/examples/motor-bracket.textcad', import.meta.url), 'utf8')
    valid(source, (result) => {
        assert.equal(result.roots[0].solidCount, 1)
        assert.ok(volume(result) > 50000)
        assert.ok(meshCadModels(result.roots).triangles.length > 0)
    })
})
