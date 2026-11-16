import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { parseTextCad } from '../../src/dsl/parser.ts'
import { analyzeTextCad } from '../../src/dsl/semantic.ts'

function analyze(source: string, revisionId = 1) {
    const parsed = parseTextCad(source, { revisionId })
    assert.deepEqual(parsed.diagnostics, [], 'Expected syntactically valid test source.')
    return analyzeTextCad(parsed.document, { revisionId })
}

test('analyzes the complete star program', () => {
    const source = readFileSync(
        new URL('../../docs/dsl/examples/star.textcad', import.meta.url),
        'utf8',
    )
    const result = analyze(source, 15)

    assert.deepEqual(result.diagnostics, [])
    assert.deepEqual(result.program.header, {
        version: 1,
        defaultLength: 'mm',
        defaultAngle: 'deg',
        sourceId: result.program.header?.sourceId,
    })
    assert.equal(result.program.parameters.length, 1)
    assert.equal(result.program.parameters[0].name, 'starHeight')
    assert.equal(result.program.parameters[0].valueType, 'length')
    assert.deepEqual(
        result.program.bindings.map(({ name, valueType }) => ({ name, valueType })),
        [
            { name: 'starProfile', valueType: 'sketch' },
            { name: 'starBody', valueType: 'solid' },
        ],
    )
    assert.equal(result.program.bindings[0].expression.kind, 'sketch')
    if (result.program.bindings[0].expression.kind === 'sketch') {
        assert.equal(result.program.bindings[0].expression.profiles[0].curves.length, 12)
    }
    assert.deepEqual(
        result.program.roots.map(({ reference, label }) => ({ reference, label })),
        [{ reference: 'starBody', label: 'Star' }],
    )
})

test('requires the textcad header and at least one root', () => {
    const result = analyze('[param height 20mm]')
    const codes = result.diagnostics.map(({ code }) => code)

    assert.ok(codes.includes('TCD-S004'))
    assert.ok(codes.includes('TCD-S008'))
})

test('reports unknown commands and arguments', () => {
    const result = analyze([
        '[textcad version=1 default-length=mm default-angle=deg extra=true]',
        '[magic value=10mm]',
        '[root missing]',
    ].join('\n'))

    assert.ok(result.diagnostics.some(({ code }) => code === 'TCD-S005'))
    assert.ok(result.diagnostics.some(({ code }) => code === 'TCD-S001'))
    assert.ok(result.diagnostics.some(({ code }) => code === 'TCD-S002'))
})

test('distinguishes duplicate, forward and unknown references', () => {
    const result = analyze([
        '[textcad version=1 default-length=mm default-angle=deg]',
        '[let body [extrude futureProfile length=20mm]]',
        '[let futureProfile [sketch plane=XY [profile [circle center=[0mm 0mm] radius=10mm]]]]',
        '[param futureProfile 10mm]',
        '[root nowhere]',
    ].join('\n'), 22)

    const forward = result.diagnostics.find(({ code }) => code === 'TCD-S007')
    const duplicate = result.diagnostics.find(({ code }) => code === 'TCD-S003')
    const unknown = result.diagnostics.find(({ code }) => code === 'TCD-S002')

    assert.equal(forward?.revisionId, 22)
    assert.equal(duplicate?.relatedSpans.length, 1)
    assert.ok(unknown)
})

test('checks units and referenced value types', () => {
    const result = analyze([
        '[textcad version=1 default-length=mm default-angle=deg]',
        '[param angle 45deg]',
        '[let profile [sketch plane=XY [profile [circle center=[0mm 0mm] radius=angle]]]]',
        '[let goodProfile [sketch plane=XY [profile [circle center=[0mm 0mm] radius=10mm]]]]',
        '[root goodProfile]',
    ].join('\n'))

    const typeErrors = result.diagnostics.filter(({ code }) => code === 'TCD-S006')
    assert.equal(typeErrors.length, 2)
    assert.ok(typeErrors.some(({ message }) => message.includes('length')))
    assert.ok(typeErrors.some(({ message }) => message.includes('solid')))
})

test('reports repeated named arguments', () => {
    const result = analyze([
        '[textcad version=1 version=1 default-length=mm default-angle=deg]',
        '[root missing]',
    ].join('\n'))

    const repeated = result.diagnostics.find(({ code }) => code === 'TCD-S005')
    assert.equal(repeated?.relatedSpans.length, 1)
})
