import * as THREE from 'three'
import type { MeshRange } from '../../cad/meshCadModel.ts'

/** Reuse the display buffers; only draw the requested faces/bodies a second time. */
export function createModelHighlight(source: THREE.BufferGeometry, color: number, opacity: number) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', source.getAttribute('position'))
    geometry.setAttribute('normal', source.getAttribute('normal'))
    geometry.setIndex(source.getIndex())
    geometry.boundingSphere = source.boundingSphere
    const material = new THREE.MeshStandardMaterial({
        color, opacity, transparent: true, depthWrite: false,
        roughness: 0.75, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    })
    // An array material makes Three.js honor the index-buffer groups.
    const mesh = new THREE.Mesh(geometry, [material])
    mesh.visible = false
    mesh.renderOrder = 1
    return {
        mesh,
        setRanges(ranges: readonly MeshRange[], nextOpacity = opacity) {
            geometry.clearGroups()
            for (const { start, count } of ranges) geometry.addGroup(start, count, 0)
            mesh.visible = ranges.length > 0
            material.opacity = nextOpacity
        },
        dispose() { geometry.dispose(); material.dispose() },
    }
}
