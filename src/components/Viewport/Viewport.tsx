import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createAdaptiveGrid } from './adaptiveGrid.ts'
import { formatGridSpacing } from './gridScale.ts'
import './Viewport.css'

type MeshData = {
    vertices: number[]
    normals: number[]
    triangles: number[]
    bodyCount: number
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
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
    const controlsRef = useRef<OrbitControls | null>(null)
    const modelRadiusRef = useRef(40)
    const [gridStep, setGridStep] = useState<number | null>(null)
    const [cursorPosition, setCursorPosition] = useState<CursorPosition | null>(null)

    const bodyCount = mesh?.bodyCount ?? 0
    const bodyCountMod100 = bodyCount % 100
    const bodyLabel = bodyCountMod100 >= 11 && bodyCountMod100 <= 14
        ? 'тел'
        : bodyCount % 10 === 1 ? 'тело' : bodyCount % 10 >= 2 && bodyCount % 10 <= 4 ? 'тела' : 'тел'
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
                grid: 0x7b8797,
                xAxis: 0xc76974,
                yAxis: 0x4f9870,
                zAxis: 0x5f78bd,
            }
            : {
                background: 0x202020,
                grid: 0x8b95a5,
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
        cameraRef.current = camera

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
        })

        renderer.setPixelRatio(window.devicePixelRatio)
        renderer.setSize(width, height)

        container.appendChild(renderer.domElement)

        const grid = createAdaptiveGrid(palette)
        scene.add(grid.group)

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
        controlsRef.current = controls

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

        let displayedGridStep = 0
        const animate = (time = performance.now()) => {
            controls.update()
            const step = grid.update(camera, controls.target, container.clientHeight, modelRadiusRef.current, time)
            if (step !== displayedGridStep) {
                displayedGridStep = step
                setGridStep(step)
            }

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

            grid.dispose()

            renderer.dispose()

            sceneRef.current = null
            cameraRef.current = null
            controlsRef.current = null

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

        // Fit all published geometry, including large rotors and offset bodies.
        geometry.computeBoundingSphere()
        const camera = cameraRef.current
        const controls = controlsRef.current
        const sphere = geometry.boundingSphere
        if (camera && controls && sphere && sphere.radius > 0) {
            modelRadiusRef.current = sphere.radius
            const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2)
            const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect)
            const distance = sphere.radius / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov)) * 1.15
            const direction = camera.position.clone().sub(controls.target).normalize()
            if (direction.lengthSq() === 0) direction.set(1, -1, 0.75).normalize()
            controls.target.copy(sphere.center)
            camera.position.copy(sphere.center).addScaledVector(direction, distance)
            camera.near = Math.max(0.01, sphere.radius / 1000)
            camera.far = Math.max(1000, distance + sphere.radius * 20)
            controls.maxDistance = Math.max(1500, distance * 5)
            camera.updateProjectionMatrix()
            controls.update()
        }

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
            {gridStep !== null && (
                <div className="viewport__grid-scale" aria-label="Шаг сетки"
                    title={`Мелкая ячейка: ${formatGridSpacing(gridStep)} мм; крупная: ${formatGridSpacing(gridStep * 5)} мм`}>
                    Сетка <strong>{formatGridSpacing(gridStep)} мм</strong>
                </div>
            )}

            <div className="viewport__statusbar">
                <div className="viewport__model-info">
                    <span className="viewport__model-icon" aria-hidden="true">▣</span>
                    <span>
                        {bodyCount} {bodyLabel}
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
