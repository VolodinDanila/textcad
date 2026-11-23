import type { CadMesh, MeshRange } from './meshCadModel.ts'

/** Face numbers belong to one evaluated mesh, never a persistent CAD reference. */
export type ModelTarget = { nodeId: string; faceIndex?: number }
export type ModelBodyInfo = { name: string; inputs: string[]; published: boolean }

export function sameTarget(a: ModelTarget | null, b: ModelTarget | null) {
    return a?.nodeId === b?.nodeId && a?.faceIndex === b?.faceIndex
}

function containingRange<T extends MeshRange>(ranges: readonly T[], index: number): T | undefined {
    let low = 0
    let high = ranges.length - 1
    while (low <= high) {
        const middle = (low + high) >>> 1
        const range = ranges[middle]
        if (index < range.start) high = middle - 1
        else if (index >= range.start + range.count) low = middle + 1
        else return range
    }
}

/** Three.js reports a triangle number; CAD ranges use offsets in the index buffer. */
export function meshTarget(mesh: CadMesh, triangleIndex: number | undefined): ModelTarget | null {
    if (triangleIndex === undefined || !Number.isInteger(triangleIndex) || triangleIndex < 0) return null
    const index = triangleIndex * 3
    const body = containingRange(mesh.bodies, index)
    if (!body) return null
    const face = containingRange(body.faces, index)
    return { nodeId: `body:${body.name}`, ...(face ? { faceIndex: face.faceIndex } : {}) }
}

export function relatedBodyNames(target: ModelTarget | null, bodies: readonly ModelBodyInfo[]): string[] {
    if (!target) return []
    if (target.nodeId === 'document' || target.nodeId === 'bodies') {
        return bodies.filter((body) => body.published).map((body) => body.name)
    }
    const separator = target.nodeId.indexOf(':')
    const kind = target.nodeId.slice(0, separator)
    if (!['body', 'feature', 'sketch'].includes(kind)) return []
    const name = target.nodeId.slice(separator + 1)
    const byName = new Map(bodies.map((body) => [body.name, body]))
    // A published body is selected as itself, even if another root also uses it.
    if (kind === 'body' && byName.get(name)?.published) return [name]
    const dependsOn = (bodyName: string, visited = new Set<string>()): boolean => {
        if (bodyName === name) return true
        if (visited.has(bodyName)) return false
        visited.add(bodyName)
        return byName.get(bodyName)?.inputs.some((input) => dependsOn(input, visited)) ?? false
    }
    return bodies.filter((body) => body.published && dependsOn(body.name)).map((body) => body.name)
}

export function selectionRanges(mesh: CadMesh, target: ModelTarget | null, bodies: readonly ModelBodyInfo[]): MeshRange[] {
    if (!target) return []
    if (target.faceIndex !== undefined) {
        const body = mesh.bodies.find((item) => target.nodeId === `body:${item.name}`)
        const face = body?.faces.find((item) => item.faceIndex === target.faceIndex)
        return face ? [face] : []
    }
    const names = new Set(relatedBodyNames(target, bodies))
    return mesh.bodies.filter((body) => names.has(body.name))
}

export function revealTarget(nodes: ReadonlySet<string>, target: ModelTarget | null) {
    const next = new Set(nodes)
    if (!target) return next
    next.delete('document')
    if (target.nodeId.startsWith('sketch:')) next.delete('sketches')
    if (target.nodeId.startsWith('body:') || target.nodeId.startsWith('feature:')) next.delete('bodies')
    if (target.nodeId.startsWith('feature:')) next.delete(`body:${target.nodeId.slice('feature:'.length)}`)
    return next
}

type PointerSample = { pointerId: number; button: number; clientX: number; clientY: number }

/** A drag, secondary click or multi-touch gesture must never change selection. */
export function createSelectionGesture() {
    const pointers = new Set<number>()
    let start: PointerSample | null = null
    const move = (event: PointerSample) => {
        if (start && start.pointerId === event.pointerId
            && Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) > 5) start = null
    }
    return {
        down(event: PointerSample) {
            pointers.add(event.pointerId)
            start = pointers.size === 1 && event.button === 0 ? event : null
        },
        move,
        up(event: PointerSample) {
            move(event)
            const click = pointers.size === 1 && start?.pointerId === event.pointerId && event.button === 0
            pointers.delete(event.pointerId)
            start = null
            return click
        },
        cancel() { pointers.clear(); start = null },
    }
}
