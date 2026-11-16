import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import './Viewport.css'

type MeshData = {
    vertices: number[]
    normals: number[]
    triangles: number[]
}

export type ViewportStatus = {
    level: 'INFO' | 'WARN' | 'ERROR'
    text: string
}

type ViewportProps = {
    mesh: MeshData | null
    status: ViewportStatus
    theme: 'dark' | 'light'
}

type CursorPosition = {
    x: number
    y: number
    z: number
}

function Viewport({ mesh, status, theme }: ViewportProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const sceneRef = useRef<THREE.Scene | null>(null)
    const modelRef = useRef<THREE.Mesh | null>(null)
    const [cursorPosition, setCursorPosition] = useState<CursorPosition | null>(null)

    // The current DSL builds a single solid; future multi-solid models can extend this count.
    const bodyCount = mesh ? 1 : 0
    const triangleCount = mesh ? Math.floor(mesh.triangles.length / 3) : 0

    useEffect(() => {
        const container = containerRef.current

        if (!container) {
            return
        }

        const isLightTheme = theme === 'light'
        const palette = isLightTheme
            ? {
                background: 0xf2f4f7,
                grid: 0x8993a1,
                xAxis: 0xc76974,
                yAxis: 0x4f9870,
                zAxis: 0x5f78bd,
            }
            : {
                background: 0x202020,
                grid: 0x6b6b6b,
                xAxis: 0xf24040,
                yAxis: 0x40d959,
                zAxis: 0x4488ff,
            }

        const scene = new THREE.Scene()
        scene.background = new THREE.Color(palette.background)

        sceneRef.current = scene

        const width = Math.max(container.clientWidth, 1)
        const height = Math.max(container.clientHeight, 1)

        const camera = new THREE.PerspectiveCamera(
            50,
            width / height,
            0.1,
            10000,
        )

        camera.up.set(0, 0, 1)
        camera.position.set(80, -80, 60)

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
        })

        renderer.setPixelRatio(window.devicePixelRatio)
        renderer.setSize(width, height)

        container.appendChild(renderer.domElement)

        const gridMaterial = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,

            uniforms: {
                uCenter: {
                    value: new THREE.Vector2(0, 0),
                },
                uFogRadius: {
                    value: 130.0,
                },
                uGridColor: {
                    value: new THREE.Color(palette.grid),
                },
                uXAxisColor: {
                    value: new THREE.Color(palette.xAxis),
                },
                uYAxisColor: {
                    value: new THREE.Color(palette.yAxis),
                },
            },

            vertexShader: `
        varying vec2 vWorldXY;

        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);

            vWorldXY = worldPosition.xy;

            gl_Position =
                projectionMatrix * viewMatrix * worldPosition;
        }
    `,

            fragmentShader: `
        varying vec2 vWorldXY;

        uniform vec2 uCenter;
        uniform float uFogRadius;
        uniform vec3 uGridColor;
        uniform vec3 uXAxisColor;
        uniform vec3 uYAxisColor;

        float gridLine(float spacing) {
            vec2 coord = vWorldXY / spacing;

            vec2 derivative = max(
                fwidth(coord),
                vec2(0.0001)
            );

            vec2 line = abs(
                fract(coord - 0.5) - 0.5
            ) / derivative;

            return 1.0 - min(min(line.x, line.y), 1.0);
        }

        void main() {
            float fine = gridLine(1.0);
            float coarse = gridLine(10.0);

            float pixelSize = max(
                fwidth(vWorldXY.x),
                fwidth(vWorldXY.y)
            );

            float fineVisibility =
                1.0 - smoothstep(0.25, 1.0, pixelSize);

            fine *= fineVisibility;

            float xAxis = 1.0 - smoothstep(
                0.0,
                1.5 * max(fwidth(vWorldXY.y), 0.0001),
                abs(vWorldXY.y)
            );

            float yAxis = 1.0 - smoothstep(
                0.0,
                1.5 * max(fwidth(vWorldXY.x), 0.0001),
                abs(vWorldXY.x)
            );

            vec3 color = uGridColor;

            float alpha = max(
                fine * 0.25,
                coarse * 0.5
            );

            color = mix(
                color,
                uXAxisColor,
                xAxis
            );

            color = mix(
                color,
                uYAxisColor,
                yAxis
            );

            alpha = max(alpha, xAxis * 0.9);
            alpha = max(alpha, yAxis * 0.9);

            float distanceToCenter =
                length(vWorldXY - uCenter);

            float fade = 1.0 - smoothstep(
                uFogRadius * 0.25,
                uFogRadius,
                distanceToCenter
            );

            gl_FragColor = vec4(color, alpha * fade);
        }
    `,
        });

        const grid = new THREE.Mesh(
            new THREE.PlaneGeometry(10000, 10000),
            gridMaterial,
        );

        grid.position.z = -0.01;
        scene.add(grid);

        const zAxisGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, -10000),
            new THREE.Vector3(0, 0, 10000),
        ]);

        const zAxisMaterial = new THREE.LineBasicMaterial({
            color: palette.zAxis,
            transparent: true,
            opacity: 1,
            depthTest: true,
            depthWrite: false,
        });

        const zAxis = new THREE.Line(
            zAxisGeometry,
            zAxisMaterial,
        );

        zAxis.frustumCulled = false;
        zAxis.renderOrder = 2;

        scene.add(zAxis);

        const ambientLight = new THREE.AmbientLight(
            0xffffff,
            isLightTheme ? 1.9 : 1.5,
        )
        scene.add(ambientLight)

        const directionalLight = new THREE.DirectionalLight(0xffffff, 2)
        directionalLight.position.set(50, -50, 100)
        scene.add(directionalLight)

        const controls = new OrbitControls(
            camera,
            renderer.domElement,
        )

        controls.enableDamping = true
        controls.target.set(0, 0, 0)
        controls.maxDistance = 1500

        // Surface coordinates have priority. Otherwise, intersect the XY plane at Z = 0.
        const raycaster = new THREE.Raycaster()
        const pointer = new THREE.Vector2()
        const xyPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
        const planePoint = new THREE.Vector3()

        const handlePointerMove = (event: PointerEvent) => {
            const rect = renderer.domElement.getBoundingClientRect()
            if (rect.width === 0 || rect.height === 0) return

            pointer.set(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1,
            )

            raycaster.setFromCamera(pointer, camera)

            const model = modelRef.current
            const hit = model
                ? raycaster.intersectObject(model, false)[0]
                : undefined

            const point = hit?.point ??
                raycaster.ray.intersectPlane(xyPlane, planePoint)

            setCursorPosition(point
                ? { x: point.x, y: point.y, z: point.z }
                : null)
        }

        const handlePointerLeave = () => setCursorPosition(null)

        renderer.domElement.addEventListener('pointermove', handlePointerMove)
        renderer.domElement.addEventListener('pointerleave', handlePointerLeave)

        let animationFrameId = 0

        const animate = () => {
            controls.update()

            const distance = controls.getDistance()
            const fogRadius = THREE.MathUtils.clamp(distance, 40, 350)
            gridMaterial.uniforms.uFogRadius.value = THREE.MathUtils.lerp(
                gridMaterial.uniforms.uFogRadius.value,
                fogRadius,
                0.12,
            )

            // The Z axis has its own simple distance-based fade.
            zAxisMaterial.opacity = 1 - THREE.MathUtils.smoothstep(
                distance, 500, 1200,
            )

            grid.position.x = controls.target.x
            grid.position.y = controls.target.y

            gridMaterial.uniforms.uCenter.value.set(
                controls.target.x,
                controls.target.y,
            )

            renderer.render(scene, camera)

            animationFrameId = requestAnimationFrame(animate)
        }

        animate()

        const handleResize = () => {
            const newWidth = Math.max(container.clientWidth, 1)
            const newHeight = Math.max(container.clientHeight, 1)

            camera.aspect = newWidth / newHeight
            camera.updateProjectionMatrix()

            renderer.setSize(newWidth, newHeight)
        }

        const resizeObserver = new ResizeObserver(handleResize)
        resizeObserver.observe(container)

        return () => {
            resizeObserver.disconnect()
            renderer.domElement.removeEventListener('pointermove', handlePointerMove)
            renderer.domElement.removeEventListener('pointerleave', handlePointerLeave)

            cancelAnimationFrame(animationFrameId)

            controls.dispose()

            grid.geometry.dispose()
            gridMaterial.dispose()

            zAxisGeometry.dispose()
            zAxisMaterial.dispose()

            renderer.dispose()

            sceneRef.current = null

            renderer.domElement.remove()
        }
    }, [theme])

    useEffect(() => {
        const scene = sceneRef.current

        if (!scene || !mesh) {
            return
        }

        if (modelRef.current) {
            scene.remove(modelRef.current)

            modelRef.current.geometry.dispose()

            const material = modelRef.current.material

            if (Array.isArray(material)) {
                material.forEach((item) => item.dispose())
            } else {
                material.dispose()
            }
        }

        const geometry = new THREE.BufferGeometry()

        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(mesh.vertices, 3),
        )

        geometry.setAttribute(
            'normal',
            new THREE.Float32BufferAttribute(mesh.normals, 3),
        )

        geometry.setIndex(mesh.triangles)

        const material = new THREE.MeshStandardMaterial({
            color: theme === 'light' ? 0x98a3b2 : 0xb0b0b0,
            roughness: 0.7,
            metalness: 0.1,
        })

        const model = new THREE.Mesh(
            geometry,
            material,
        )

        modelRef.current = model

        scene.add(model)

        return () => {
            scene.remove(model)
            geometry.dispose()
            material.dispose()

            if (modelRef.current === model) {
                modelRef.current = null
            }
        }
    }, [mesh, theme])

    return (
        <div className="viewport">
            <div ref={containerRef} className="viewport__canvas" />

            <div className="viewport__statusbar">
                <div className="viewport__model-info">
                    <span className="viewport__model-icon" aria-hidden="true">▣</span>
                    <span>
                        {bodyCount} {bodyCount === 1 ? 'тело' : 'тел'}
                        {' · '}
                        {triangleCount.toLocaleString('ru-RU')} трис
                    </span>
                </div>

                <div className="viewport__message" role="status" aria-live="polite">
                    <span className={`viewport__level viewport__level--${status.level.toLowerCase()}`}>
                        {status.level}
                    </span>
                    <span className="viewport__message-text" title={status.text}>
                        {status.text}
                    </span>
                </div>

                <div className="viewport__coordinates" aria-label="Координаты курсора">
                    <span className="viewport__coord-x">
                        X {cursorPosition?.x.toFixed(1) ?? '—'}
                    </span>
                    <span className="viewport__coord-y">
                        Y {cursorPosition?.y.toFixed(1) ?? '—'}
                    </span>
                    <span className="viewport__coord-z">
                        Z {cursorPosition?.z.toFixed(1) ?? '—'}
                    </span>
                    <span className="viewport__units">мм</span>
                </div>
            </div>
        </div>
    )
}

export default Viewport
