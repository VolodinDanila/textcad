import { useEffect, useState } from 'react'
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
} from './dsl'
import starSource from '../docs/dsl/examples/star.textcad?raw'
import './App.css'

type MeshData = ReturnType<typeof meshCadModel>
type AppTheme = 'dark' | 'light'

type ModelInfo = {
    sketchName: string
    extrusionDistance: number
}

const DSL_REVISION = 1

function diagnosticMessage(diagnostic: Diagnostic) {
    const { line, column } = diagnostic.sourceSpan.start
    return `${diagnostic.code} · ${line}:${column} · ${diagnostic.message}`
}

function App() {
    const [mesh, setMesh] = useState<MeshData | null>(null)
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
        sketchName: '—',
        extrusionDistance: 0,
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
        let cancelled = false

        const buildModel = async () => {
            try {
                await initCad()
                if (cancelled) return

                setStatus({ level: 'INFO', text: 'Построение модели...' })

                const parsed = parseTextCad(starSource, { revisionId: DSL_REVISION })
                if (parsed.diagnostics.length > 0) {
                    throw new Error(diagnosticMessage(parsed.diagnostics[0]))
                }

                const analyzed = analyzeTextCad(parsed.document, { revisionId: DSL_REVISION })
                if (analyzed.diagnostics.length > 0) {
                    throw new Error(diagnosticMessage(analyzed.diagnostics[0]))
                }

                const evaluated = evaluateTextCad(analyzed.program, { revisionId: DSL_REVISION })
                if (evaluated.diagnostics.length > 0) {
                    throw new Error(diagnosticMessage(evaluated.diagnostics[0]))
                }

                const root = evaluated.roots[0]
                if (!root) {
                    throw new Error('DSL не опубликовал корневую модель')
                }

                const sketch = evaluated.artifacts.find(({ kind }) => kind === 'sketch')
                const extrusion = evaluated.artifacts.find(({ kind }) => kind === 'solid')
                const meshData = meshCadModel(root.shape)
                if (cancelled) return

                setMesh(meshData)
                setModelInfo({
                    sketchName: sketch?.name ?? 'Эскиз',
                    extrusionDistance: extrusion?.kind === 'solid' ? extrusion.distance : 0,
                })
                setStatus({ level: 'INFO', text: 'Модель построена из TextCAD DSL' })
            } catch (error) {
                if (cancelled) return

                setStatus({
                    level: 'ERROR',
                    text: error instanceof Error
                        ? error.message
                        : 'Ошибка построения модели',
                })
            }
        }

        void buildModel()

        return () => {
            cancelled = true
        }
    }, [])

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
                        sketchName={modelInfo.sketchName}
                        extrusionDistance={modelInfo.extrusionDistance}
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
                        source={starSource}
                        width={rightPanelWidth}
                        onClose={() => setIsRightPanelOpen(false)}
                    />
                )}
            </div>
        </main>
    )
}

export default App
