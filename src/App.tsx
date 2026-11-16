import { useEffect, useRef, useState } from 'react'
import AppHeader from './components/AppHeader/AppHeader'
import LeftTree from './components/LeftTree/LeftTree'
import PanelResizer from './components/PanelResizer/PanelResizer'
import RightPanel from './components/RightPanel/RightPanel'
import Viewport, { type ViewportStatus } from './components/Viewport/Viewport'
import { initCad } from './cad/initCad'
import { meshCadModel } from './cad/meshCadModel'
import {
    analyzeTextCad,
    evaluateTextCad,
    parseTextCad,
    type Diagnostic,
    type EvaluationResult,
} from './dsl'
import starSource from '../docs/dsl/examples/star.textcad?raw'
import './App.css'

type MeshData = ReturnType<typeof meshCadModel>
type AppTheme = 'dark' | 'light'

type ModelInfo = {
    sketches: string[]
    bodies: Array<{
        name: string
        operation: 'extrude'
        distance: number
    }>
}

type SourceState = 'building' | 'synced' | 'error'

const EVALUATION_DELAY = 350

function diagnosticMessage(diagnostic: Diagnostic) {
    const { line, column } = diagnostic.sourceSpan.start
    return `${diagnostic.code} · ${line}:${column} · ${diagnostic.message}`
}

function runtimeDiagnostic(message: string, revisionId: number): Diagnostic {
    const position = { offset: 0, line: 1, column: 1 }
    return {
        code: 'TCD-R001',
        severity: 'error',
        message,
        sourceSpan: { start: position, end: { ...position } },
        revisionId,
        relatedSpans: [],
    }
}

function disposeSolids(result: EvaluationResult) {
    for (const artifact of result.artifacts) {
        if (artifact.kind === 'solid') {
            artifact.shape.delete()
        }
    }
}

function App() {
    const [mesh, setMesh] = useState<MeshData | null>(null)
    const [source, setSource] = useState(starSource)
    const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
    const [sourceState, setSourceState] = useState<SourceState>('building')
    const revisionRef = useRef(0)
    const [theme, setTheme] = useState<AppTheme>(() => {
        const savedTheme = localStorage.getItem('textcad-theme')
        return savedTheme === 'dark' || savedTheme === 'light'
            ? savedTheme
            : 'light'
    })
    const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true)
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(true)
    const [leftPanelWidth, setLeftPanelWidth] = useState(246)
    const [rightPanelWidth, setRightPanelWidth] = useState(326)
    const [modelInfo, setModelInfo] = useState<ModelInfo>({
        sketches: [],
        bodies: [],
    })
    const [status, setStatus] = useState<ViewportStatus>({
        level: 'INFO',
        text: 'Инициализация CAD-ядра...',
    })

    useEffect(() => {
        localStorage.setItem('textcad-theme', theme)
        document.documentElement.style.colorScheme = theme
    }, [theme])

    useEffect(() => {
        const revisionId = revisionRef.current + 1
        revisionRef.current = revisionId
        let cancelled = false

        const isCurrentRevision = () => (
            !cancelled && revisionRef.current === revisionId
        )

        const showDiagnostics = (nextDiagnostics: Diagnostic[]) => {
            if (!isCurrentRevision()) return

            setDiagnostics(nextDiagnostics)
            setSourceState('error')
            setStatus({
                level: 'ERROR',
                text: diagnosticMessage(nextDiagnostics[0]),
            })
        }

        const buildModel = async () => {
            try {
                await initCad()
                if (!isCurrentRevision()) return

                const parsed = parseTextCad(source, { revisionId })
                if (parsed.diagnostics.length > 0) {
                    showDiagnostics(parsed.diagnostics)
                    return
                }

                const analyzed = analyzeTextCad(parsed.document, { revisionId })
                if (analyzed.diagnostics.length > 0) {
                    showDiagnostics(analyzed.diagnostics)
                    return
                }

                const evaluated = evaluateTextCad(analyzed.program, { revisionId })
                if (evaluated.diagnostics.length > 0) {
                    showDiagnostics(evaluated.diagnostics)
                    disposeSolids(evaluated)
                    return
                }

                const root = evaluated.roots[0]
                if (!root) {
                    showDiagnostics([
                        runtimeDiagnostic('DSL не опубликовал корневую модель.', revisionId),
                    ])
                    disposeSolids(evaluated)
                    return
                }

                let meshData: MeshData
                try {
                    meshData = meshCadModel(root.shape)
                } finally {
                    disposeSolids(evaluated)
                }
                const nextModelInfo: ModelInfo = {
                    sketches: evaluated.artifacts
                        .filter(({ kind }) => kind === 'sketch')
                        .map(({ name }) => name),
                    bodies: evaluated.artifacts
                        .filter((artifact) => artifact.kind === 'solid')
                        .map(({ name, operation, distance }) => ({
                            name,
                            operation,
                            distance,
                        })),
                }
                if (!isCurrentRevision()) return

                setMesh(meshData)
                setModelInfo(nextModelInfo)
                setDiagnostics([])
                setSourceState('synced')
                setStatus({
                    level: 'INFO',
                    text: `Модель синхронизирована · ревизия ${revisionId}`,
                })
            } catch (error) {
                const message = error instanceof Error
                    ? error.message
                    : 'Ошибка построения модели'
                showDiagnostics([runtimeDiagnostic(message, revisionId)])
            }
        }

        const timerId = window.setTimeout(() => {
            void buildModel()
        }, EVALUATION_DELAY)

        return () => {
            cancelled = true
            window.clearTimeout(timerId)
        }
    }, [source])

    const handleSourceChange = (nextSource: string) => {
        setSource(nextSource)
        setSourceState('building')
        setStatus({
            level: mesh ? 'WARN' : 'INFO',
            text: mesh
                ? 'Source изменён · пересчёт модели...'
                : 'Инициализация CAD-ядра и построение модели...',
        })
    }

    return (
        <main className="app-shell" data-theme={theme}>
            <AppHeader
                documentName="Без названия"
                theme={theme}
                isLeftPanelOpen={isLeftPanelOpen}
                isRightPanelOpen={isRightPanelOpen}
                onToggleTheme={() => {
                    setTheme((current) => current === 'dark' ? 'light' : 'dark')
                }}
                onToggleLeftPanel={() => setIsLeftPanelOpen((isOpen) => !isOpen)}
                onToggleRightPanel={() => setIsRightPanelOpen((isOpen) => !isOpen)}
            />

            <div className="app-workspace">
                {isLeftPanelOpen && (
                    <LeftTree
                        documentName="Без названия"
                        sketches={modelInfo.sketches}
                        bodies={modelInfo.bodies}
                        isStale={sourceState !== 'synced'}
                        width={leftPanelWidth}
                        onClose={() => setIsLeftPanelOpen(false)}
                    />
                )}

                {isLeftPanelOpen && (
                    <PanelResizer
                        side="left"
                        value={leftPanelWidth}
                        min={210}
                        max={420}
                        onChange={setLeftPanelWidth}
                    />
                )}

                <Viewport mesh={mesh} status={status} theme={theme} />

                {isRightPanelOpen && (
                    <PanelResizer
                        side="right"
                        value={rightPanelWidth}
                        min={260}
                        max={480}
                        onChange={setRightPanelWidth}
                    />
                )}

                {isRightPanelOpen && (
                    <RightPanel
                        source={source}
                        diagnostics={diagnostics}
                        sourceState={sourceState}
                        width={rightPanelWidth}
                        onSourceChange={handleSourceChange}
                        onClose={() => setIsRightPanelOpen(false)}
                    />
                )}
            </div>
        </main>
    )
}

export default App
