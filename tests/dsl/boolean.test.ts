import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import opencascade from 'replicad-opencascadejs'
import { measureVolume, setOC } from 'replicad'
import { meshCadModels } from '../../src/cad/meshCadModel.ts'
import { evaluateTextCad, type EvaluationResult } from '../../src/dsl/evaluator.ts'
import { parseTextCad } from '../../src/dsl/parser.ts'
import { analyzeTextCad } from '../../src/dsl/semantic.ts'

setOC(await opencascade())

const header = '[textcad version=1 default-length=mm default-angle=deg]'
const square = `[profile
    [line start=[0mm 0mm] end=[10mm 0mm]]
    [line start=[10mm 0mm] end=[10mm 10mm]]
    [line start=[10mm 10mm] end=[0mm 10mm]]
    [line start=[0mm 10mm] end=[0mm 0mm]]
]`

function sourceFor(operation: string, origin = '[5mm 0mm 0mm]') {
    return `${header}
        [let first [sketch plane=XY ${square}]]
        [let second [sketch plane=XY origin=${origin} ${square}]]
        [let a [extrude first length=10mm]]
        [let b [extrude second length=10mm]]
        ${operation}`
}

function analyze(source: string) {
    const parsed = parseTextCad(source)
    assert.deepEqual(parsed.diagnostics, [])
    return analyzeTextCad(parsed.document)
}

function evaluate(source: string) {
    const analyzed = analyze(source)
    assert.deepEqual(analyzed.diagnostics, [])
    return evaluateTextCad(analyzed.program, { revisionId: 41 })
}

function dispose(result: EvaluationResult) {
    for (const artifact of result.artifacts) {
        if (artifact.kind === 'solid') artifact.shape.delete()
    }
}

for (const [operation, volume] of [['union', 1500], ['cut', 500], ['intersect', 500]] as const) {
    test(`${operation} computes exact solid geometry without changing its inputs`, () => {
        const result = evaluate(sourceFor(`[let result [${operation} a b]] [root result]`))
        try {
            assert.deepEqual(result.diagnostics, [])
            assert.equal(result.roots.length, 1)
            assert.ok(Math.abs(measureVolume(result.roots[0].shape) - volume) < 1e-6)
            for (const name of ['a', 'b']) {
                const artifact = result.artifacts.find((item) => item.name === name)
                assert.equal(artifact?.kind, 'solid')
                if (artifact?.kind === 'solid') {
                    assert.ok(Math.abs(measureVolume(artifact.shape) - 1000) < 1e-6)
                }
            }
            const artifact = result.artifacts.find((item) => item.name === 'result')
            assert.equal(artifact?.kind, 'solid')
            if (artifact?.kind === 'solid') {
                assert.equal(artifact.operation, operation)
                assert.deepEqual(artifact.inputs, ['a', 'b'])
                assert.equal(artifact.solidCount, 1)
            }
        } finally {
            dispose(result)
        }
    })
}

test('nested operations and inline extrusions build a reusable solid expression', () => {
    const result = evaluate(sourceFor(
        '[let result [union a [cut [extrude second length=10mm] a]]] [root result]',
    ))
    try {
        assert.deepEqual(result.diagnostics, [])
        assert.ok(Math.abs(measureVolume(result.roots[0].shape) - 1500) < 1e-6)
    } finally {
        dispose(result)
    }
})

test('variadic booleans process every operand in source order', () => {
    const result = evaluate(sourceFor('[let result [cut a b b]] [root result]'))
    try {
        assert.deepEqual(result.diagnostics, [])
        assert.ok(Math.abs(measureVolume(result.roots[0].shape) - 500) < 1e-6)
    } finally {
        dispose(result)
    }
})

test('a disjoint union preserves two solids while a face-touching union makes one', () => {
    for (const [x, count] of [[30, 2], [10, 1]]) {
        const result = evaluate(sourceFor('[let result [union a b]] [root result]', `[${x}mm 0mm 0mm]`))
        try {
            assert.deepEqual(result.diagnostics, [])
            assert.equal(result.roots[0].solidCount, count)
            assert.ok(Math.abs(measureVolume(result.roots[0].shape) - 2000) < 1e-6)
        } finally {
            dispose(result)
        }
    }
})

test('empty intersection and complete removal report a geometry diagnostic', () => {
    for (const source of [
        sourceFor('[let result [intersect a b]] [root result]', '[30mm 0mm 0mm]'),
        sourceFor('[let result [cut a a]] [root result]'),
        sourceFor('[let result [intersect a b]] [root result]', '[10mm 0mm 0mm]'),
    ]) {
        const result = evaluate(source)
        try {
            assert.equal(result.diagnostics[0]?.code, 'TCD-G006')
            assert.equal(result.roots.length, 0)
        } finally {
            dispose(result)
        }
    }
})

test('all published roots are meshed with correct indices and physical body count', () => {
    const result = evaluate(sourceFor('[root a] [root b]', '[30mm 0mm 0mm]'))
    try {
        assert.deepEqual(result.diagnostics, [])
        assert.equal(result.roots.length, 2)
        const mesh = meshCadModels(result.roots)
        assert.equal(mesh.bodyCount, 2)
        assert.equal(mesh.vertices.length, mesh.normals.length)
        assert.ok(mesh.triangles.every((index) => index >= 0 && index < mesh.vertices.length / 3))
        const xs = mesh.vertices.filter((_, index) => index % 3 === 0)
        assert.equal(Math.min(...xs), 0)
        assert.equal(Math.max(...xs), 40)
        const triangleCount = result.roots.reduce((total, root) => total + root.shape.mesh().triangles.length, 0)
        assert.equal(mesh.triangles.length, triangleCount)
    } finally {
        dispose(result)
    }
})

test('repeated roots do not duplicate display geometry', () => {
    const result = evaluate(sourceFor('[root a] [root a label="Again"]'))
    try {
        assert.deepEqual(result.diagnostics, [])
        assert.equal(result.roots.length, 1)
    } finally {
        dispose(result)
    }
})

test('sketch origin uses world coordinates and length parameters on all basic planes', () => {
    for (const plane of ['XY', 'XZ', 'YZ']) {
        const result = evaluate(`${header}
            [param offset 30mm]
            [let s [sketch plane=${plane} origin=[offset 40mm 50mm]
                [profile [circle center=[0mm 0mm] radius=2mm]]]]
            [let body [extrude s length=10mm symmetric=true]] [root body]`)
        try {
            assert.deepEqual(result.diagnostics, [])
            const sketch = result.artifacts.find((item) => item.kind === 'sketch')
            if (sketch?.kind === 'sketch') assert.deepEqual(sketch.origin, [30, 40, 50])
            const mesh = meshCadModels(result.roots)
            for (let axis = 0; axis < 3; axis += 1) {
                const values = mesh.vertices.filter((_, index) => index % 3 === axis)
                const center = (Math.min(...values) + Math.max(...values)) / 2
                assert.ok(Math.abs(center - [30, 40, 50][axis]) < 0.01)
            }
        } finally {
            dispose(result)
        }
    }
})

test('origin arity and units, boolean arity, types and references are checked before CAD execution', () => {
    const cases = [
        [sourceFor('[root a]', '[0mm 0mm]'), 'TCD-S006'],
        [sourceFor('[root a]', '[0mm 0mm 30deg]'), 'TCD-S006'],
        [sourceFor('[let x [cut a]] [root a]'), 'TCD-S004'],
        [sourceFor('[let x [union first a]] [root a]'), 'TCD-S006'],
        [sourceFor('[let x [intersect a missing]] [root a]'), 'TCD-S002'],
        [sourceFor('[let x [cut a future]] [let future [extrude first length=1mm]] [root a]'), 'TCD-S007'],
        [sourceFor('[let x [union a [sketch plane=XY ' + square + ']]] [root a]'), 'TCD-S006'],
        [sourceFor('[let x [union a b unknown=true]] [root a]'), 'TCD-S005'],
    ]
    for (const [source, code] of cases) {
        assert.ok(analyze(source).diagnostics.some((item) => item.code === code), `${code}: ${source}`)
    }
})

test('a self-crossing closed line profile is rejected', () => {
    const result = evaluate(`${header}
        [let s [sketch plane=XY [profile
            [line start=[0mm 0mm] end=[10mm 10mm]]
            [line start=[10mm 10mm] end=[0mm 10mm]]
            [line start=[0mm 10mm] end=[10mm 0mm]]
            [line start=[10mm 0mm] end=[0mm 0mm]]
        ]]] [let body [extrude s length=5mm]] [root body]`)
    try {
        assert.equal(result.diagnostics[0]?.code, 'TCD-G003')
        assert.equal(result.roots.length, 0)
    } finally {
        dispose(result)
    }
})

for (const fileName of ['boolean-demo.textcad', 'multiple-roots.textcad']) {
    test(`builds the documented ${fileName} example`, () => {
        const source = readFileSync(new URL(`../../docs/dsl/examples/${fileName}`, import.meta.url), 'utf8')
        const result = evaluate(source)
        try {
            assert.deepEqual(result.diagnostics, [])
            assert.ok(result.roots.length > 0)
            assert.ok(meshCadModels(result.roots).triangles.length > 0)
        } finally {
            dispose(result)
        }
    })
}
