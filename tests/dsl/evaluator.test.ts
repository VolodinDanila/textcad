import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import opencascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'

import { evaluateTextCad } from '../../src/dsl/evaluator.ts'
import { parseTextCad } from '../../src/dsl/parser.ts'
import { analyzeTextCad } from '../../src/dsl/semantic.ts'

const oc = await opencascade()
setOC(oc)

function evaluate(source: string, revisionId = 1) {
    const parsed = parseTextCad(source, { revisionId })
    assert.deepEqual(parsed.diagnostics, [], 'Expected syntactically valid test source.')

    const analyzed = analyzeTextCad(parsed.document, { revisionId })
    assert.deepEqual(analyzed.diagnostics, [], 'Expected semantically valid test source.')

    return evaluateTextCad(analyzed.program, { revisionId })
}

function bounds(values: number[], coordinate: 0 | 1 | 2) {
    const coordinates = values.filter((_, index) => index % 3 === coordinate)
    return [Math.min(...coordinates), Math.max(...coordinates)] as const
}

test('builds the star example through Replicad', () => {
    const source = readFileSync(
        new URL('../../docs/dsl/examples/star.textcad', import.meta.url),
        'utf8',
    )
    const result = evaluate(source, 31)

    assert.deepEqual(result.diagnostics, [])
    assert.equal(result.revisionId, 31)
    assert.deepEqual(
        result.artifacts.map(({ name, kind }) => ({ name, kind })),
        [
            { name: 'starProfile', kind: 'sketch' },
            { name: 'starBody', kind: 'solid' },
        ],
    )
    assert.equal(result.roots.length, 1)

    const starHeight = result.parameters.find(({ name }) => name === 'starHeight')
    assert.ok(starHeight, 'Expected the starHeight parameter.')
    assert.equal(starHeight.unit, 'mm')

    const mesh = result.roots[0].shape.mesh()
    assert.ok(mesh.vertices.length > 0)
    assert.ok(mesh.triangles.length > 0)
    assert.deepEqual(bounds(mesh.vertices, 2), [
        Math.min(0, starHeight.value),
        Math.max(0, starHeight.value),
    ])
})

test('builds a circular profile with a hole', () => {
    const result = evaluate([
        '[textcad version=1 default-length=mm default-angle=deg]',
        '[let ringProfile [sketch plane=XY',
        '  [profile role=outer [circle center=[0mm 0mm] radius=20mm]]',
        '  [profile role=hole [circle center=[0mm 0mm] radius=10mm]]',
        ']]',
        '[let ring [extrude ringProfile length=5mm]]',
        '[root ring]',
    ].join('\n'))

    assert.deepEqual(result.diagnostics, [])
    const mesh = result.roots[0].shape.mesh()
    assert.ok(mesh.triangles.length > 0)
    assert.deepEqual(bounds(mesh.vertices, 2), [0, 5])
})

test('centers a symmetric extrusion around the sketch plane', () => {
    const result = evaluate([
        '[textcad version=1 default-length=mm default-angle=deg]',
        '[let profile [sketch plane=XY [profile',
        '  [line start=[0mm 0mm] end=[10mm 0mm]]',
        '  [line start=[10mm 0mm] end=[10mm 10mm]]',
        '  [line start=[10mm 10mm] end=[0mm 10mm]]',
        '  [line start=[0mm 10mm] end=[0mm 0mm]]',
        ']]]',
        '[let body [extrude profile length=20mm symmetric=true]]',
        '[root body]',
    ].join('\n'))

    assert.deepEqual(result.diagnostics, [])
    const mesh = result.roots[0].shape.mesh()
    assert.deepEqual(bounds(mesh.vertices, 2), [-10, 10])
})

test('reports an open profile without calling the CAD kernel', () => {
    const result = evaluate([
        '[textcad version=1 default-length=mm default-angle=deg]',
        '[let profile [sketch plane=XY [profile',
        '  [line start=[0mm 0mm] end=[10mm 0mm]]',
        '  [line start=[10mm 0mm] end=[10mm 10mm]]',
        ']]]',
        '[let body [extrude profile length=5mm]]',
        '[root body]',
    ].join('\n'))

    assert.equal(result.diagnostics[0]?.code, 'TCD-G001')
    assert.equal(result.roots.length, 0)
})

test('reports disconnected curves and invalid arcs', () => {
    const disconnected = evaluate([
        '[textcad version=1 default-length=mm default-angle=deg]',
        '[let profile [sketch plane=XY [profile',
        '  [line start=[0mm 0mm] end=[10mm 0mm]]',
        '  [line start=[5mm 5mm] end=[0mm 0mm]]',
        ']]]',
        '[let body [extrude profile length=5mm]]',
        '[root body]',
    ].join('\n'))
    const invalidArc = evaluate([
        '[textcad version=1 default-length=mm default-angle=deg]',
        '[let profile [sketch plane=XY [profile',
        '  [arc start=[0mm 0mm] middle=[5mm 0mm] end=[10mm 0mm]]',
        '  [line start=[10mm 0mm] end=[0mm 0mm]]',
        ']]]',
        '[let body [extrude profile length=5mm]]',
        '[root body]',
    ].join('\n'))

    assert.equal(disconnected.diagnostics[0]?.code, 'TCD-G002')
    assert.equal(invalidArc.diagnostics[0]?.code, 'TCD-G004')
})
