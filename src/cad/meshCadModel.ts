export function meshCadModel(model: {
    mesh: (options?: {
        tolerance?: number
        angularTolerance?: number
    }) => {
        vertices: number[]
        normals: number[]
        triangles: number[]
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
    }
}

/** Combine published roots for display without performing a CAD boolean union. */
export function meshCadModels(models: ReadonlyArray<{
    shape: Parameters<typeof meshCadModel>[0]
    solidCount: number
}>) {
    const vertices: number[] = []
    const normals: number[] = []
    const triangles: number[] = []
    let bodyCount = 0
    for (const model of models) {
        const mesh = meshCadModel(model.shape)
        const vertexOffset = vertices.length / 3
        for (const value of mesh.vertices) vertices.push(value)
        for (const value of mesh.normals) normals.push(value)
        for (const index of mesh.triangles) triangles.push(index + vertexOffset)
        bodyCount += model.solidCount
    }
    return { vertices, normals, triangles, bodyCount }
}
