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