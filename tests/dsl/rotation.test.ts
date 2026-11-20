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
const radialSection = `[let section [sketch plane=XZ [profile
    [line start=[5mm 0mm] end=[10mm 0mm]]
    [line start=[10mm 0mm] end=[10mm 4mm]]
    [line start=[10mm 4mm] end=[5mm 4mm]]
    [line start=[5mm 4mm] end=[5mm 0mm]]
]]]`
const offsetPin = `[let pinProfile [sketch plane=XY
    [profile [circle center=[10mm 0mm] radius=1mm]]]]
    [let pin [extrude pinProfile length=2mm]]`

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

function close(actual: number, expected: number, tolerance = 1e-5) {
    assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`)
}

for (const angle of [360, 180, -180, 90]) {
    test(`revolve ${angle}deg builds the expected annular volume`, () => {
        const result = evaluate(`${header} ${radialSection}
            [param span ${angle}deg] [let ring [revolve section angle=span]] [root ring]`)
        try {
            assert.deepEqual(result.diagnostics, [])
            close(measureVolume(result.roots[0].shape), Math.PI * 75 * 4 * Math.abs(angle) / 360)
            assert.equal(result.roots[0].solidCount, 1)
            const sketch = result.artifacts.find((item) => item.name === 'section')
            assert.equal(sketch?.kind, 'sketch')
        } finally {
            dispose(result)
        }
    })
}

test('revolve uses world origin and an explicit vector axis', () => {
    const source = `${header} ${radialSection.replace('plane=XZ', 'plane=XZ origin=[20mm 0mm 0mm]')}
        [let ring [revolve section axis=[0 0 2] origin=[20mm 0mm 0mm]]]
        [root ring]`
    const result = evaluate(source)
    try {
        assert.deepEqual(result.diagnostics, [])
        close(measureVolume(result.roots[0].shape), Math.PI * 75 * 4)
        const xs = meshCadModels(result.roots).vertices.filter((_, index) => index % 3 === 0)
        close(Math.min(...xs), 10, 0.02)
        close(Math.max(...xs), 30, 0.02)
    } finally {
        dispose(result)
    }
})

test('a profile touching the axis revolves into a full cylinder', () => {
    const result = evaluate(`${header} ${radialSection.replaceAll('5mm', '0mm')}
        [let cylinder [revolve section]] [root cylinder]`)
    try {
        assert.deepEqual(result.diagnostics, [])
        close(measureVolume(result.roots[0].shape), Math.PI * 100 * 4)
    } finally {
        dispose(result)
    }
})

test('a circular section revolves into a torus without a primitive command', () => {
    const result = evaluate(`${header}
        [let section [sketch plane=XZ [profile [circle center=[10mm 0mm] radius=2mm]]]]
        [let torus [revolve section]] [root torus]`)
    try {
        assert.deepEqual(result.diagnostics, [])
        close(measureVolume(result.roots[0].shape), 2 * Math.PI ** 2 * 10 * 4)
    } finally {
        dispose(result)
    }
})

test('full circular pattern has no duplicate at 360deg and preserves its input', () => {
    const result = evaluate(`${header} ${offsetPin}
        [param copies 4] [let pins [pattern-circular pin count=copies]] [root pins]`)
    try {
        assert.deepEqual(result.diagnostics, [])
        assert.equal(result.roots[0].solidCount, 4)
        close(measureVolume(result.roots[0].shape), 4 * Math.PI * 2)
        const pin = result.artifacts.find((item) => item.name === 'pin')
        if (pin?.kind === 'solid') close(measureVolume(pin.shape), Math.PI * 2)
        const pattern = result.artifacts.find((item) => item.name === 'pins')
        if (pattern?.kind === 'solid') {
            assert.equal(pattern.count, 4)
            assert.deepEqual(pattern.inputs, ['pin'])
        }
    } finally {
        dispose(result)
    }
})

test('partial circular pattern includes both endpoints of its angular span', () => {
    const result = evaluate(`${header} ${offsetPin}
        [let pins [pattern-circular pin count=3 angle=90deg]] [root pins]`)
    try {
        assert.deepEqual(result.diagnostics, [])
        assert.equal(result.roots[0].solidCount, 3)
        close(measureVolume(result.roots[0].shape), 3 * Math.PI * 2)
        const mesh = meshCadModels(result.roots)
        for (const coordinate of [0, 1]) {
            const values = mesh.vertices.filter((_, index) => index % 3 === coordinate)
            close(Math.min(...values), -1, 0.02)
            close(Math.max(...values), 11, 0.02)
        }
    } finally {
        dispose(result)
    }
})

test('single-copy pattern applies its starting angle and accepts inline solids', () => {
    const result = evaluate(`${header} ${offsetPin}
        [let pin90 [pattern-circular [extrude pinProfile length=2mm] count=1 start-angle=90deg]] [root pin90]`)
    try {
        assert.deepEqual(result.diagnostics, [])
        const mesh = meshCadModels(result.roots)
        const xs = mesh.vertices.filter((_, index) => index % 3 === 0)
        close(Math.min(...xs), -1, 0.02)
        close(Math.max(...xs), 1, 0.02)
    } finally {
        dispose(result)
    }
})

test('circular pattern respects shifted world axes and negative spans', () => {
    const result = evaluate(`${header} ${offsetPin.replace('plane=XY', 'plane=XY origin=[100mm 0mm 0mm]')}
        [let pins [pattern-circular pin count=2 angle=-180deg axis=[0 0 5] origin=[100mm 0mm 0mm]]]
        [root pins]`)
    try {
        assert.deepEqual(result.diagnostics, [])
        assert.equal(result.roots[0].solidCount, 2)
        const xs = meshCadModels(result.roots).vertices.filter((_, index) => index % 3 === 0)
        close(Math.min(...xs), 89, 0.02)
        close(Math.max(...xs), 111, 0.02)
    } finally {
        dispose(result)
    }
})

test('overlapping circular copies merge into a valid solid', () => {
    const result = evaluate(`${header}
        [let s [sketch plane=XY [profile [circle center=[0mm 0mm] radius=2mm]]]]
        [let body [extrude s length=3mm]]
        [let copies [pattern-circular body count=4]] [root copies]`)
    try {
        assert.deepEqual(result.diagnostics, [])
        assert.equal(result.roots[0].solidCount, 1)
        close(measureVolume(result.roots[0].shape), Math.PI * 4 * 3)
    } finally {
        dispose(result)
    }
})

test('rotation contracts reject wrong units, object types and unknown arguments', () => {
    for (const operation of [
        '[let bad [revolve section angle=20mm]]',
        '[let bad [revolve section axis=[0mm 0 1]]]',
        '[let bad [revolve section axis=notAnAxis]]',
        '[let bad [pattern-circular section count=4]]',
        '[let bad [pattern-circular pin count=4mm]]',
        '[let bad [pattern-circular pin count=4 angle=10mm]]',
        '[let bad [pattern-circular pin count=4 unexpected=true]]',
    ]) {
        const result = analyze(`${header} ${radialSection} ${offsetPin} ${operation} [root pin]`)
        assert.ok(result.diagnostics.length > 0, operation)
    }
})

test('invalid counts, zero axes and degenerate angular spans fail before unsafe construction', () => {
    for (const operation of [
        '[revolve section angle=0deg]',
        '[revolve section angle=361deg]',
        '[revolve section axis=[0 0 0]]',
        '[pattern-circular pin count=0]',
        '[pattern-circular pin count=129]',
        '[pattern-circular pin count=2.5]',
        '[pattern-circular pin count=2 angle=0deg]',
        '[pattern-circular pin count=2 axis=[0 0 0]]',
    ]) {
        const result = evaluate(`${header} ${radialSection} ${offsetPin} [let bad ${operation}] [root bad]`)
        try {
            assert.equal(result.diagnostics[0]?.code, 'TCD-G004', operation)
            assert.equal(result.roots.length, 0)
        } finally {
            dispose(result)
        }
    }
})

test('brake disc example builds as one valid body with real drilled holes and grooves', () => {
    const source = readFileSync(new URL('../../docs/dsl/examples/brake-disc.textcad', import.meta.url), 'utf8')
    const result = evaluate(source)
    try {
        assert.deepEqual(result.diagnostics, [])
        assert.equal(result.roots.length, 1)
        assert.equal(result.roots[0].solidCount, 1)
        const solids = new Map(result.artifacts.filter((item) => item.kind === 'solid').map((item) => [item.name, item]))
        const volume = (name: string) => measureVolume(solids.get(name)!.shape)
        assert.ok(volume('rotor') > volume('mountedRotor'))
        close(volume('rotor') - volume('mountedRotor'), 5 * Math.PI * 6.5 ** 2 * 10, 0.01)
        close(volume('mountedRotor') - volume('drilledRotor'), 36 * Math.PI * 2.5 ** 2 * 20, 0.01)
        assert.ok(volume('drilledRotor') > volume('finishedRotor'))
        const mesh = meshCadModels(result.roots)
        assert.ok(mesh.triangles.length > 0)
        const zs = mesh.vertices.filter((_, index) => index % 3 === 2)
        close(Math.min(...zs), 0)
        close(Math.max(...zs), 35)
    } finally {
        dispose(result)
    }
})
