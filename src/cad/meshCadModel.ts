export type MeshRange = { start: number; count: number }
export type MeshFace = MeshRange & { faceIndex: number }
export type MeshBody = MeshRange & { name: string; faces: MeshFace[] }

export function meshCadModel(model: {
    mesh: (options?: {
        tolerance?: number
        angularTolerance?: number
    }) => {
        vertices: number[]
        normals: number[]
        triangles: number[]
        faceGroups?: Array<MeshRange & { faceId: number }>
    }
}) {
    const mesh = model.mesh({
        tolerance: 0.1,
        angularTolerance: 0.1,
    })

    return {
        vertices: mesh.vertices,
        normals: mesh.normals,
        triangles: mesh.triangles,
        faces: (mesh.faceGroups ?? []).map(({ start, count }, faceIndex) => ({ start, count, faceIndex })),
    }
}

/** Combine published roots for display without performing a CAD boolean union. */
export function meshCadModels(models: ReadonlyArray<{
    name: string
    shape: Parameters<typeof meshCadModel>[0]
    solidCount: number
}>) {
    const vertices: number[] = []
    const normals: number[] = []
    const triangles: number[] = []
    const bodies: MeshBody[] = []
    let bodyCount = 0
    for (const model of models) {
        const mesh = meshCadModel(model.shape)
        const vertexOffset = vertices.length / 3
        const start = triangles.length
        for (const value of mesh.vertices) vertices.push(value)
        for (const value of mesh.normals) normals.push(value)
        for (const index of mesh.triangles) triangles.push(index + vertexOffset)
        bodies.push({
            name: model.name,
            start,
            count: mesh.triangles.length,
            faces: mesh.faces.map((face) => ({ ...face, start: face.start + start }))
                .sort((a, b) => a.start - b.start),
        })
        bodyCount += model.solidCount
    }
    return { vertices, normals, triangles, bodyCount, bodies }
}

export type CadMesh = ReturnType<typeof meshCadModels>
