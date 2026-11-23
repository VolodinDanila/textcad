import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import opencascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { meshCadModels, type CadMesh } from '../../src/cad/meshCadModel.ts'
import { createSelectionGesture, meshTarget, relatedBodyNames, revealTarget, selectionRanges } from '../../src/cad/modelSelection.ts'
import { createModelHighlight } from '../../src/components/Viewport/modelHighlight.ts'
import { parseTextCad } from '../../src/dsl/parser.ts'
import { analyzeTextCad } from '../../src/dsl/semantic.ts'
import { evaluateTextCad } from '../../src/dsl/evaluator.ts'

const mesh: CadMesh = {
    vertices: [], normals: [], triangles: Array(18).fill(0), bodyCount: 2,
    bodies: [
        { name: 'a', start: 0, count: 12, faces: [{ start: 0, count: 6, faceIndex: 0 }, { start: 6, count: 6, faceIndex: 1 }] },
        { name: 'b', start: 12, count: 6, faces: [{ start: 12, count: 6, faceIndex: 0 }] },
    ],
}
const bodies = [
    { name: 'base', inputs: ['profile'], published: false },
    { name: 'cutter', inputs: ['hole'], published: false },
    { name: 'a', inputs: ['base', 'cutter'], published: true },
    { name: 'b', inputs: ['profile2'], published: true },
    { name: 'unused', inputs: ['unusedProfile'], published: false },
]

test('picking resolves both ends of every face and the boundary between published bodies', () => {
    for (const [triangle, name, faceIndex] of [[0, 'a', 0], [1, 'a', 0], [2, 'a', 1], [3, 'a', 1], [4, 'b', 0], [5, 'b', 0]] as const) {
        assert.deepEqual(meshTarget(mesh, triangle), { nodeId: `body:${name}`, faceIndex })
    }
    for (const triangle of [undefined, -1, 0.5, NaN, 6, 10000]) assert.equal(meshTarget(mesh, triangle), null)
})

test('CAD face selection covers the whole face and never crosses bodies with equal face numbers', () => {
    assert.deepEqual(selectionRanges(mesh, { nodeId: 'body:b', faceIndex: 0 }, bodies), [mesh.bodies[1].faces[0]])
    assert.deepEqual(selectionRanges(mesh, { nodeId: 'body:a', faceIndex: 1 }, bodies), [mesh.bodies[0].faces[1]])
    assert.deepEqual(selectionRanges(mesh, { nodeId: 'body:a', faceIndex: 99 }, bodies), [])
    assert.deepEqual(selectionRanges(mesh, { nodeId: 'body:a' }, bodies), [mesh.bodies[0]])
    assert.deepEqual(selectionRanges(mesh, null, bodies), [])
})

test('sketches, tools, intermediate operations and dependency links resolve transitive outputs', () => {
    for (const nodeId of ['sketch:profile', 'sketch:hole', 'body:base', 'feature:cutter']) {
        assert.deepEqual(relatedBodyNames({ nodeId }, bodies), ['a'])
    }
    assert.deepEqual(selectionRanges(mesh, { nodeId: 'sketch:profile' }, bodies), [mesh.bodies[0]])
    assert.deepEqual(relatedBodyNames({ nodeId: 'sketch:unusedProfile' }, bodies), [])
    assert.deepEqual(relatedBodyNames({ nodeId: 'body:missing' }, bodies), [])
    assert.deepEqual(relatedBodyNames({ nodeId: 'document' }, bodies), ['a', 'b'])
    assert.deepEqual(relatedBodyNames({ nodeId: 'sketches' }, bodies), [])
    const shared = [...bodies, { name: 'shared', inputs: ['a', 'b'], published: true }]
    assert.deepEqual(relatedBodyNames({ nodeId: 'body:a' }, shared), ['a'])
    assert.deepEqual(relatedBodyNames({ nodeId: 'feature:a' }, shared), ['a', 'shared'])
    assert.deepEqual(relatedBodyNames({ nodeId: 'sketch:profile' }, shared), ['a', 'shared'])
    assert.deepEqual(relatedBodyNames({ nodeId: 'sketch:missing' }, [{ name: 'loop', inputs: ['loop'], published: true }]), [])
})

test('viewport selection reveals the correct tree ancestors without changing other branches', () => {
    const closed = new Set(['document', 'sketches', 'bodies', 'body:a', 'body:b'])
    assert.deepEqual([...revealTarget(closed, { nodeId: 'body:a', faceIndex: 0 })], ['sketches', 'body:a', 'body:b'])
    assert.deepEqual([...revealTarget(closed, { nodeId: 'feature:a' })], ['sketches', 'body:b'])
    assert.deepEqual([...revealTarget(closed, { nodeId: 'sketch:profile' })], ['bodies', 'body:a', 'body:b'])
    assert.equal(closed.size, 5)
})

const pointer = (clientX = 10, pointerId = 1, button = 0) => ({ clientX, clientY: 20, pointerId, button })
test('only a short primary click selects; orbit, pan, cancellation and returning drags do not', () => {
    const gesture = createSelectionGesture()
    gesture.down(pointer()); assert.equal(gesture.up(pointer(13)), true)
    gesture.down(pointer()); gesture.move(pointer(40)); assert.equal(gesture.up(pointer(10)), false)
    gesture.down(pointer()); assert.equal(gesture.up(pointer(25)), false)
    gesture.down(pointer(10, 1, 2)); assert.equal(gesture.up(pointer(10, 1, 2)), false)
    gesture.down(pointer(10, 1, 1)); assert.equal(gesture.up(pointer(10, 1, 1)), false)
    gesture.down(pointer()); gesture.cancel(); assert.equal(gesture.up(pointer()), false)
    assert.equal(gesture.up(pointer()), false)
})

test('pinch gestures do not become a selection when either finger is lifted', () => {
    const gesture = createSelectionGesture()
    gesture.down(pointer()); gesture.down(pointer(30, 2))
    assert.equal(gesture.up(pointer(30, 2)), false)
    assert.equal(gesture.up(pointer()), false)
    gesture.down(pointer()); assert.equal(gesture.up(pointer()), true)
})

test('highlight overlays share display buffers and restrict drawing to the selected ranges', () => {
    const geometry = new THREE.BoxGeometry(10, 10, 10)
    const highlight = createModelHighlight(geometry, 0xaa77dd, 0.5)
    try {
        assert.equal(highlight.mesh.geometry.getAttribute('position'), geometry.getAttribute('position'))
        assert.equal(highlight.mesh.geometry.getIndex(), geometry.getIndex())
        highlight.setRanges([{ start: 6, count: 6 }, { start: 24, count: 6 }])
        assert.deepEqual(highlight.mesh.geometry.groups, [{ start: 6, count: 6, materialIndex: 0 }, { start: 24, count: 6, materialIndex: 0 }])
        assert.equal(highlight.mesh.visible, true)
        highlight.setRanges([])
        assert.equal(highlight.mesh.visible, false)
        assert.deepEqual(highlight.mesh.geometry.groups, [])
        assert.equal(geometry.index?.count, 36)
    } finally { highlight.dispose(); geometry.dispose() }
})

test('real CAD meshes preserve complete face ownership and Three.js picks the nearest published body', async () => {
    setOC(await opencascade())
    const parsed = parseTextCad(`[textcad version=1 default-length=mm default-angle=deg]
        [let p [sketch plane=XY [profile [rectangle origin=[-5mm -5mm] width=10mm height=10mm]]]]
        [let a [extrude p length=10mm]] [let b [translate a vector=[0mm 0mm 20mm]]] [root a] [root b]`)
    assert.deepEqual(parsed.diagnostics, [])
    const analyzed = analyzeTextCad(parsed.document)
    assert.deepEqual(analyzed.diagnostics, [])
    const result = evaluateTextCad(analyzed.program)
    const geometry = new THREE.BufferGeometry()
    const material = new THREE.MeshBasicMaterial()
    try {
        assert.deepEqual(result.diagnostics, [])
        const actual = meshCadModels(result.roots)
        assert.equal(actual.bodies.length, 2)
        for (const body of actual.bodies) {
            assert.equal(body.faces.length, 6)
            assert.equal(body.faces.reduce((sum, face) => sum + face.count, 0), body.count)
            for (let index = body.start; index < body.start + body.count; index += 3) {
                const target = meshTarget(actual, index / 3)
                assert.equal(target?.nodeId, `body:${body.name}`)
                assert.ok(target?.faceIndex !== undefined)
                const [range] = selectionRanges(actual, target, [])
                assert.ok(index >= range.start && index < range.start + range.count)
                assert.equal(range.count, 6)
            }
        }
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(actual.vertices, 3))
        geometry.setIndex(actual.triangles)
        const model = new THREE.Mesh(geometry, material)
        model.updateMatrixWorld()
        const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 100), new THREE.Vector3(0, 0, -1))
        const hit = raycaster.intersectObject(model)[0]
        assert.equal(hit.point.z, 30)
        assert.equal(meshTarget(actual, hit.faceIndex ?? undefined)?.nodeId, 'body:b')
    } finally {
        geometry.dispose(); material.dispose()
        for (const artifact of result.artifacts) if (artifact.kind === 'solid') artifact.shape.delete()
    }
})
