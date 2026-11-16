import { useEffect, useState } from 'react'
import AppHeader from './components/AppHeader/AppHeader'
import LeftTree from './components/LeftTree/LeftTree'
import PanelResizer from './components/PanelResizer/PanelResizer'
import RightPanel from './components/RightPanel/RightPanel'
import Viewport, { type ViewportStatus } from './components/Viewport/Viewport'
import { initCad } from './cad/initCad'
import { meshCadModel } from './cad/meshCadModel'
import {
    buildTestModel,
    getTestModelSource,
    testExtrudeCommand,
    testSketchCommand,
} from './examples/testModel'
import './App.css'

type MeshData = ReturnType<typeof meshCadModel>
type AppTheme = 'dark' | 'light'

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

                const model = buildTestModel()
                const meshData = meshCadModel(model)
                if (cancelled) return

                setMesh(meshData)
                setStatus({ level: 'INFO', text: 'Модель построена' })
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
                        sketchName={testSketchCommand.name}
                        extrusionDistance={testExtrudeCommand.distance}
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
                        source={getTestModelSource()}
                        width={rightPanelWidth}
                        onClose={() => setIsRightPanelOpen(false)}
                    />
                )}
            </div>
        </main>
    )
}

export default App
