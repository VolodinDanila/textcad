import * as THREE from 'three'
import { gridSpacing, gridViewMetrics } from './gridScale.ts'

type GridPalette = { grid: number; xAxis: number; yAxis: number; zAxis: number }

export function createAdaptiveGrid(palette: GridPalette) {
    const group = new THREE.Group()
    const center = new THREE.Vector3()
    const uniforms = {
        uCenter: { value: center },
        uFadeStart: { value: 1000 },
        uFadeEnd: { value: 3000 },
        uSpacing: { value: 1 },
        uPreviousSpacing: { value: 1 },
        uBlend: { value: 1 },
        uGridColor: { value: new THREE.Color(palette.grid) },
        uXAxisColor: { value: new THREE.Color(palette.xAxis) },
        uYAxisColor: { value: new THREE.Color(palette.yAxis) },
    }
    const material = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        // Place the floor behind coincident model faces without a fixed world offset.
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
        vertexShader: `
            varying vec3 vWorld;
            void main() {
                vec4 world = modelMatrix * vec4(position, 1.0);
                vWorld = world.xyz;
                gl_Position = projectionMatrix * viewMatrix * world;
            }
        `,
        fragmentShader: `
            varying vec3 vWorld;
            uniform vec3 uCenter;
            uniform float uFadeStart;
            uniform float uFadeEnd;
            uniform float uSpacing;
            uniform float uPreviousSpacing;
            uniform float uBlend;
            uniform vec3 uGridColor;
            uniform vec3 uXAxisColor;
            uniform vec3 uYAxisColor;

            float gridLine(float spacing) {
                vec2 coord = vWorld.xy / spacing;
                vec2 derivative = max(fwidth(coord), vec2(0.000001));
                vec2 distanceToLine = abs(fract(coord - 0.5) - 0.5) / derivative;
                vec2 line = 1.0 - smoothstep(vec2(0.0), vec2(1.0), distanceToLine);
                // Suppress subpixel lines near the horizon instead of drawing moire.
                vec2 visibility = smoothstep(vec2(2.0), vec2(7.0), 1.0 / derivative);
                return max(line.x * visibility.x, line.y * visibility.y);
            }

            float gridLevel(float spacing) {
                return max(gridLine(spacing) * 0.14, gridLine(spacing * 5.0) * 0.30);
            }

            void main() {
                float alpha = mix(gridLevel(uPreviousSpacing), gridLevel(uSpacing), uBlend);
                vec2 axisWidth = max(fwidth(vWorld.xy), vec2(0.000001));
                float xAxis = 1.0 - smoothstep(0.0, axisWidth.y * 1.2, abs(vWorld.y));
                float yAxis = 1.0 - smoothstep(0.0, axisWidth.x * 1.2, abs(vWorld.x));
                vec3 color = mix(uGridColor, uXAxisColor, xAxis);
                color = mix(color, uYAxisColor, yAxis);
                alpha = max(alpha, max(xAxis, yAxis) * 0.8);
                // Only the distant floor fades; nothing overlays or fogs the model.
                float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distance(vWorld.xy, uCenter.xy));
                gl_FragColor = vec4(color, alpha * fade);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
            }
        `,
    })
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
    floor.frustumCulled = false
    group.add(floor)

    const axisMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
            uCenter: uniforms.uCenter,
            uFadeStart: uniforms.uFadeStart,
            uFadeEnd: uniforms.uFadeEnd,
            uColor: { value: new THREE.Color(palette.zAxis) },
        },
        vertexShader: material.vertexShader,
        fragmentShader: `
            varying vec3 vWorld;
            uniform vec3 uCenter;
            uniform float uFadeStart;
            uniform float uFadeEnd;
            uniform vec3 uColor;
            void main() {
                float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distance(vWorld, uCenter));
                gl_FragColor = vec4(uColor, 0.8 * fade);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
            }
        `,
    })
    const axisGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1),
    ])
    const zAxis = new THREE.Line(axisGeometry, axisMaterial)
    zAxis.frustumCulled = false
    group.add(zAxis)

    let spacing: number | undefined
    let previousTime = 0
    return {
        group,
        update(camera: THREE.PerspectiveCamera, target: THREE.Vector3, height: number, radius: number, time: number) {
            const metrics = gridViewMetrics(camera.position.distanceTo(target), camera.fov, height, radius)
            const next = gridSpacing(metrics.worldUnitsPerPixel, spacing)
            if (spacing !== next) {
                uniforms.uPreviousSpacing.value = spacing ?? next
                uniforms.uSpacing.value = next
                uniforms.uBlend.value = spacing === undefined ? 1 : 0
                spacing = next
            }
            const elapsed = Math.min(Math.max(time - previousTime, 0), 50)
            uniforms.uBlend.value = Math.min(1, uniforms.uBlend.value + elapsed / 160)
            previousTime = time
            center.copy(target)
            uniforms.uFadeStart.value = metrics.fadeStart
            uniforms.uFadeEnd.value = metrics.fadeEnd
            floor.position.set(target.x, target.y, 0)
            floor.scale.set(metrics.extent, metrics.extent, 1)
            zAxis.position.z = target.z
            zAxis.scale.z = metrics.extent
            if (Math.abs(camera.near - metrics.near) > metrics.near * 0.01
                || Math.abs(camera.far - metrics.far) > metrics.far * 0.01) {
                camera.near = metrics.near
                camera.far = metrics.far
                camera.updateProjectionMatrix()
            }
            return next
        },
        dispose() {
            floor.geometry.dispose()
            material.dispose()
            axisGeometry.dispose()
            axisMaterial.dispose()
        },
    }
}
