import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createAdaptiveGrid } from './adaptiveGrid.ts'
import { formatGridSpacing } from './gridScale.ts'
import { useLocale } from '../../i18n/localeContext'
import { countNoun } from '../../i18n/messages'
import { localizeStatus } from '../../i18n/diagnostics'
import type { CadMesh } from '../../cad/meshCadModel'
import { createSelectionGesture, meshTarget, sameTarget, selectionRanges, type ModelBodyInfo, type ModelTarget } from '../../cad/modelSelection'
import { createModelHighlight } from './modelHighlight'
import './Viewport.css'

export type ViewportStatus = {
    level: 'INFO' | 'WARN' | 'ERROR'
    text: string
}

type ViewportProps = {
    mesh: CadMesh | null
    status: ViewportStatus
    theme: 'dark' | 'light'
    bodies: ModelBodyInfo[]
    selection: ModelTarget | null
    hovered: ModelTarget | null
    onSelect: (target: ModelTarget | null) => void
    onHover: (target: ModelTarget | null) => void
}

type CursorPosition = {
    x: number
    y: number
    z: number
}

function Viewport({ mesh, status, theme, bodies, selection, hovered, onSelect, onHover }: ViewportProps) {
    const { locale, t, number } = useLocale()
    const containerRef = useRef<HTMLDivElement>(null)
    const sceneRef = useRef<THREE.Scene | null>(null)
    const modelRef = useRef<THREE.Mesh | null>(null)
    const renderedMeshRef = useRef<CadMesh | null>(null)
    const highlightsRef = useRef<{
        selected: ReturnType<typeof createModelHighlight>
        hovered: ReturnType<typeof createModelHighlight>
    } | null>(null)
    const handlersRef = useRef({ onSelect, onHover })
    useLayoutEffect(() => { handlersRef.current = { onSelect, onHover } }, [onSelect, onHover])
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
    const controlsRef = useRef<OrbitControls | null>(null)
    const modelRadiusRef = useRef(40)
    const [gridStep, setGridStep] = useState<number | null>(null)
    const [cursorPosition, setCursorPosition] = useState<CursorPosition | null>(null)

    const bodyCount = mesh?.bodyCount ?? 0
    const statusText = localizeStatus(status.text, locale)

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

        const gesture = createSelectionGesture()
        let pendingPointer: PointerEvent | null = null
        let lastPointer: PointerEvent | null = null
        const pick = (event: PointerEvent) => {
            const rect = renderer.domElement.getBoundingClientRect()
            if (rect.width === 0 || rect.height === 0 || event.clientX < rect.left || event.clientX > rect.right
                || event.clientY < rect.top || event.clientY > rect.bottom) return null

            pointer.set(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1,
            )

            camera.updateMatrixWorld()
            raycaster.setFromCamera(pointer, camera)

            const model = modelRef.current
            const hit = model
                ? raycaster.intersectObject(model, false)[0]
                : undefined

            return { hit, target: hit && renderedMeshRef.current
                ? meshTarget(renderedMeshRef.current, hit.faceIndex ?? undefined) : null }
        }

        const updatePointer = (event: PointerEvent) => {
            const result = pick(event)
            const point = result ? result.hit?.point ?? raycaster.ray.intersectPlane(xyPlane, planePoint) : null

            setCursorPosition(point
                ? { x: point.x, y: point.y, z: point.z }
                : null)
            const target = event.buttons === 0 ? result?.target ?? null : null
            handlersRef.current.onHover(target)
            renderer.domElement.style.cursor = target ? 'pointer' : ''
        }

        const clearHover = () => {
            pendingPointer = null
            lastPointer = null
            setCursorPosition(null)
            handlersRef.current.onHover(null)
            renderer.domElement.style.cursor = ''
        }
        const handlePointerMove = (event: PointerEvent) => {
            gesture.move(event)
            // Raycast at most once per frame, including on high-frequency mice.
            pendingPointer = event
            lastPointer = event
        }
        const handlePointerDown = (event: PointerEvent) => {
            container.focus({ preventScroll: true })
            gesture.down(event)
            clearHover()
        }
        const handlePointerUp = (event: PointerEvent) => {
            if (gesture.up(event)) handlersRef.current.onSelect(pick(event)?.target ?? null)
            lastPointer = event
            pendingPointer = event
        }
        const handleCancel = () => { gesture.cancel(); clearHover() }
        const handleCameraChange = () => {
            if (lastPointer?.buttons === 0) pendingPointer = lastPointer
        }

        renderer.domElement.addEventListener('pointermove', handlePointerMove)
        renderer.domElement.addEventListener('pointerleave', clearHover)
        renderer.domElement.addEventListener('pointerdown', handlePointerDown)
        renderer.domElement.addEventListener('pointerup', handlePointerUp)
        renderer.domElement.addEventListener('pointercancel', handleCancel)
        window.addEventListener('blur', handleCancel)
        controls.addEventListener('change', handleCameraChange)

        let animationFrameId = 0

        let displayedGridStep = 0
        const animate = (time = performance.now()) => {
            controls.update()
            if (pendingPointer) {
                const event = pendingPointer
                pendingPointer = null
                updatePointer(event)
            }
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
            renderer.domElement.removeEventListener('pointerleave', clearHover)
            renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
            renderer.domElement.removeEventListener('pointerup', handlePointerUp)
            renderer.domElement.removeEventListener('pointercancel', handleCancel)
            window.removeEventListener('blur', handleCancel)
            controls.removeEventListener('change', handleCameraChange)

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
        renderedMeshRef.current = mesh

        scene.add(model)

        // Fit all published geometry, including large rotors and offset bodies.
        geometry.computeBoundingSphere()
        geometry.computeBoundingBox()
        const highlights = {
            selected: createModelHighlight(geometry, theme === 'light' ? 0x9c6fd5 : 0xb58bea, 0.48),
            hovered: createModelHighlight(geometry, theme === 'light' ? 0xc5a2ed : 0xd7bbff, 0.38),
        }
        highlights.hovered.mesh.renderOrder = 2
        highlightsRef.current = highlights
        scene.add(highlights.selected.mesh, highlights.hovered.mesh)
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
            scene.remove(highlights.selected.mesh, highlights.hovered.mesh)
            highlights.selected.dispose()
            highlights.hovered.dispose()
            geometry.dispose()
            material.dispose()

            if (modelRef.current === model) {
                modelRef.current = null
                renderedMeshRef.current = null
                highlightsRef.current = null
            }
        }
    }, [mesh, theme])

    useEffect(() => {
        const highlights = highlightsRef.current
        if (!mesh || !highlights) return
        highlights.selected.setRanges(selectionRanges(mesh, selection, bodies), selection?.faceIndex !== undefined ? 0.7 : 0.48)
        highlights.hovered.setRanges(sameTarget(selection, hovered) ? [] : selectionRanges(mesh, hovered, bodies))
    }, [mesh, theme, bodies, selection, hovered])

    const targetLabel = (target: ModelTarget) => {
        const name = target.nodeId.includes(':') ? target.nodeId.slice(target.nodeId.indexOf(':') + 1) : t('Model')
        if (target.faceIndex !== undefined) return t('{name} · грань {index}', { name, index: number(target.faceIndex + 1) })
        if (target.nodeId.startsWith('sketch:')) return t('Эскиз: {name}', { name })
        if (target.nodeId.startsWith('feature:')) return t('Операция: {name}', { name })
        return name
    }
    const hasVisibleSelection = mesh && selectionRanges(mesh, selection, bodies).length > 0
    const relatedSelection = selection && (selection.nodeId.startsWith('sketch:')
        || selection.nodeId.startsWith('feature:')
        || (selection.nodeId.startsWith('body:') && !bodies.some((body) => body.published && selection.nodeId === `body:${body.name}`)))

    return (
        <div className="viewport">
            <div ref={containerRef} className="viewport__canvas" tabIndex={0} role="region"
                aria-label={t('3D-модель')}
                title={t('Клик — выбрать грань · пустое место или Esc — снять выбор · перетаскивание — вращать')}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') { event.preventDefault(); onSelect(null); onHover(null) }
                }} />
            {hovered?.faceIndex !== undefined && !sameTarget(selection, hovered) && (
                <div className="viewport__hover-label">{targetLabel(hovered)}</div>
            )}
            {selection && (
                <div className="viewport__selection" role="status" aria-label={t('Выбранная геометрия')}>
                    <span className="viewport__selection-text">
                        <strong>{t('Выбрано: {name}', { name: targetLabel(selection) })}</strong>
                        {(!hasVisibleSelection || relatedSelection) && (
                            <span>{t(hasVisibleSelection ? 'Подсвечены связанные результаты' : 'Нет в опубликованной геометрии')}</span>
                        )}
                    </span>
                    <button type="button" aria-label={t('Снять выделение')} title={t('Снять выделение (Esc)')}
                        onClick={() => { onSelect(null); onHover(null) }}>×</button>
                </div>
            )}
            {gridStep !== null && (
                <div className="viewport__grid-scale" aria-label={t('Шаг сетки')}
                    title={t('Мелкая ячейка: {minor} мм; крупная: {major} мм', { minor: formatGridSpacing(gridStep, locale), major: formatGridSpacing(gridStep * 5, locale) })}>
                    {t('Сетка')} <strong>{formatGridSpacing(gridStep, locale)} {t('мм')}</strong>
                </div>
            )}

            <div className="viewport__statusbar">
                <div className="viewport__model-info">
                    <span className="viewport__model-icon" aria-hidden="true">▣</span>
                    <span>
                        {number(bodyCount)} {countNoun(bodyCount, 'body', locale)}
                    </span>
                </div>

                <div className="viewport__message" role="status" aria-live="polite">
                    <span className={`viewport__level viewport__level--${status.level.toLowerCase()}`}>
                        {t(status.level)}
                    </span>
                    <span className="viewport__message-text" title={statusText}>
                        {statusText}
                    </span>
                </div>

                <div className="viewport__coordinates" aria-label={t('Координаты курсора')}>
                    <span className="viewport__coord-x">
                        X {cursorPosition ? number(cursorPosition.x, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}
                    </span>
                    <span className="viewport__coord-y">
                        Y {cursorPosition ? number(cursorPosition.y, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}
                    </span>
                    <span className="viewport__coord-z">
                        Z {cursorPosition ? number(cursorPosition.z, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}
                    </span>
                    <span className="viewport__units">{t('мм')}</span>
                </div>
            </div>
        </div>
    )
}

export default Viewport
