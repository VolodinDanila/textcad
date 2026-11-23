import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import AppHeader from './components/AppHeader/AppHeader'
import LeftTree from './components/LeftTree/LeftTree'
import PanelResizer from './components/PanelResizer/PanelResizer'
import RightPanel, { type PanelTab } from './components/RightPanel/RightPanel'
import Viewport, { type ViewportStatus } from './components/Viewport/Viewport'
import { initCad } from './cad/initCad'
import { meshCadModels } from './cad/meshCadModel'
import { revealTarget, sameTarget, type ModelTarget } from './cad/modelSelection'
import {
    analyzeTextCad,
    evaluateTextCad,
    parseTextCad,
    type Diagnostic,
    type EvaluationResult,
    type EvaluatedSolidArtifact,
} from './dsl'
import {
    openTextCadDocument,
    saveTextCadDocumentAs,
    writeTextCadDocument,
    type TextCadFileHandle,
} from './files/textCadFile'
import { documentHistory, type HistoryVersion } from './files/documentHistory'
import { useDocumentHistory } from './files/useDocumentHistory'
import { useLocale } from './i18n/localeContext'
import starSource from '../docs/dsl/examples/star.textcad?raw'
import './App.css'

type MeshData = ReturnType<typeof meshCadModels>
type AppTheme = 'dark' | 'light'

type ModelInfo = {
    sketches: string[]
    bodies: Array<{
        name: string
        operation: EvaluatedSolidArtifact['operation']
        distance?: number
        angle?: number
        count?: number
        inputs: string[]
        published: boolean
    }>
}

type SourceState = 'building' | 'synced' | 'error'

type DocumentSession = {
    id: string
    name: string
    source: string
    savedSource: string | null
}

const EVALUATION_DELAY = 350
const DOCUMENT_DRAFT_KEY = 'textcad-document-draft'
const NEW_DOCUMENT_SOURCE = `[textcad version=1 default-length=mm default-angle=deg]

[param bodyHeight 10mm]

[let baseProfile
  [sketch plane=XY
    [profile role=outer
      [circle center=[0mm 0mm] radius=20mm]
    ]
  ]
]

[let body
  [extrude baseProfile length=bodyHeight]
]

[root body label="Body"]
`

function loadDocumentSession(): DocumentSession {
    try {
        const draft = localStorage.getItem(DOCUMENT_DRAFT_KEY)
        if (draft) {
            const value = JSON.parse(draft) as Partial<DocumentSession>
            if (
                typeof value.name === 'string'
                && typeof value.source === 'string'
                && (typeof value.savedSource === 'string' || value.savedSource === null)
            ) {
                return {
                    id: typeof value.id === 'string' && value.id.length > 0 ? value.id : crypto.randomUUID(),
                    name: value.name,
                    source: value.source,
                    savedSource: value.savedSource,
                }
            }
        }
    } catch {
        // A blocked or corrupt draft must not prevent opening the editor.
    }

    return {
        id: crypto.randomUUID(),
        name: 'star.textcad',
        source: starSource,
        savedSource: starSource,
    }
}

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
    const { locale, t } = useLocale()
    const [mesh, setMesh] = useState<MeshData | null>(null)
    const [selection, setSelection] = useState<ModelTarget | null>(null)
    const [hovered, setHovered] = useState<ModelTarget | null>(null)
    const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(() => new Set())
    const handleSelect = useCallback((target: ModelTarget | null) => {
        setSelection((current) => sameTarget(current, target) ? current : target)
        if (target) setCollapsedNodes((current) => revealTarget(current, target))
    }, [])
    const handleHover = useCallback((target: ModelTarget | null) => {
        setHovered((current) => sameTarget(current, target) ? current : target)
    }, [])
    const handleToggleNode = useCallback((nodeId: string) => {
        setCollapsedNodes((current) => {
            const next = new Set(current)
            if (next.has(nodeId)) next.delete(nodeId)
            else next.add(nodeId)
            return next
        })
    }, [])
    const [documentSession, setDocumentSession] = useState<DocumentSession>(loadDocumentSession)
    const sessionRef = useRef(documentSession)
    useLayoutEffect(() => { sessionRef.current = documentSession }, [documentSession])
    const history = useDocumentHistory(documentSession)
    const { checkpoint: checkpointHistory, restore: restoreHistory, aiEdit: recordAiEdit } = history
    const [panelTab, setPanelTab] = useState<PanelTab>('chat')
    const [draftError, setDraftError] = useState('')
    const transitionRef = useRef(0)
    const [evaluationRequest, setEvaluationRequest] = useState(0)
    const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
    const [sourceState, setSourceState] = useState<SourceState>('building')
    const revisionRef = useRef(0)
    const fileHandleRef = useRef<TextCadFileHandle | null>(null)
    const source = documentSession.source
    const displayName = documentSession.name === 'Без названия' ? t('Без названия') : documentSession.name
    const isDocumentDirty = documentSession.savedSource === null
        || source !== documentSession.savedSource
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
        const persistDraft = async () => {
            try { localStorage.setItem(DOCUMENT_DRAFT_KEY, JSON.stringify(documentSession)); setDraftError('') }
            catch { setDraftError('Не удалось сохранить черновик браузера. Сохраните файл вручную.') }
        }
        void persistDraft()
    }, [documentSession])

    useEffect(() => {
        if (!isDocumentDirty) return

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault()
            event.returnValue = ''
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [isDocumentDirty])

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
                    meshData = meshCadModels(evaluated.roots)
                } finally {
                    disposeSolids(evaluated)
                }
                const nextModelInfo: ModelInfo = {
                    sketches: evaluated.artifacts
                        .filter(({ kind }) => kind === 'sketch')
                        .map(({ name }) => name),
                    bodies: evaluated.artifacts
                        .filter((artifact) => artifact.kind === 'solid')
                        .map(({ name, operation, distance, angle, count, inputs }) => ({
                            name,
                            operation,
                            distance,
                            angle,
                            count,
                            inputs,
                            published: evaluated.roots.some((item) => item.name === name),
                        })),
                }
                if (!isCurrentRevision()) return

                setMesh(meshData)
                setSelection(null)
                setHovered(null)
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
    }, [evaluationRequest, source])

    const handleSourceChange = (nextSource: string, reason: 'edit' | 'ai' = 'edit') => {
        if (reason === 'ai') void recordAiEdit({ ...sessionRef.current }, nextSource)
        setDocumentSession((current) => ({ ...current, source: nextSource }))
        setSourceState('building')
        setStatus({
            level: mesh ? 'WARN' : 'INFO',
            text: mesh
                ? 'Source изменён · пересчёт модели...'
                : 'Инициализация CAD-ядра и построение модели...',
        })
    }

    const confirmDiscardChanges = useCallback(() => (
        !isDocumentDirty
        || window.confirm(t('Есть несохранённые изменения. Продолжить без сохранения?'))
    ), [isDocumentDirty, t])

    const beginDocumentEvaluation = useCallback((message: string) => {
        setSelection(null)
        setHovered(null)
        setDiagnostics([])
        setSourceState('building')
        setStatus({ level: 'INFO', text: message })
        setEvaluationRequest((current) => current + 1)
    }, [])

    const handleNewDocument = useCallback(() => {
        if (!confirmDiscardChanges()) return
        transitionRef.current += 1
        void checkpointHistory({ ...sessionRef.current }, 'edit')
        fileHandleRef.current = null
        const next: DocumentSession = {
            id: crypto.randomUUID(),
            name: 'Без названия',
            source: NEW_DOCUMENT_SOURCE,
            savedSource: null,
        }
        void checkpointHistory(next, 'new')
        setDocumentSession(next)
        setPanelTab('source')
        beginDocumentEvaluation('Создание нового документа...')
    }, [beginDocumentEvaluation, confirmDiscardChanges, checkpointHistory])

    const handleOpenDocument = useCallback(async () => {
        if (!confirmDiscardChanges()) return
        const transition = ++transitionRef.current

        try {
            const opened = await openTextCadDocument(locale)
            if (!opened || transition !== transitionRef.current) return
            void checkpointHistory({ ...sessionRef.current }, 'edit')
            let id: string = crypto.randomUUID()
            let historyUnavailable = false
            try { id = await documentHistory.fileSession(opened.name, opened.source, opened.handle, 'open') }
            catch { historyUnavailable = true }
            if (transition !== transitionRef.current) return
            fileHandleRef.current = opened.handle
            setDocumentSession({
                id,
                name: opened.name,
                source: opened.source,
                savedSource: opened.source,
            })
            setPanelTab('source')
            beginDocumentEvaluation(`Открытие ${opened.name}...`)
            if (historyUnavailable) setDraftError('Файл открыт, но локальная история недоступна. Сохраняйте файл вручную.')
        } catch (error) {
            setStatus({
                level: 'ERROR',
                text: error instanceof Error
                    ? `Не удалось открыть файл: ${error.message}`
                    : 'Не удалось открыть файл',
            })
        }
    }, [beginDocumentEvaluation, confirmDiscardChanges, checkpointHistory, locale])

    const handleSaveDocumentAs = useCallback(async () => {
        const snapshot = { ...sessionRef.current }
        const sourceToSave = documentSession.source
        const suggestedName = documentSession.name === 'Без названия'
            ? 'model.textcad'
            : documentSession.name

        try {
            const saved = await saveTextCadDocumentAs(suggestedName, sourceToSave, locale)
            if (!saved) return
            await checkpointHistory(snapshot, 'edit')
            let id: string = crypto.randomUUID()
            let historyUnavailable = false
            try { id = await documentHistory.fileSession(saved.name, sourceToSave, saved.handle, 'save', undefined, snapshot.id) }
            catch { historyUnavailable = true }
            if (sessionRef.current.id !== snapshot.id) return
            fileHandleRef.current = saved.handle
            setDocumentSession((current) => ({
                ...current,
                id,
                name: saved.name,
                savedSource: sourceToSave,
            }))
            setStatus({ level: historyUnavailable ? 'WARN' : 'INFO', text: historyUnavailable ? `${saved.name} сохранён; локальная история недоступна` : `${saved.name} сохранён` })
        } catch (error) {
            setStatus({
                level: 'ERROR',
                text: error instanceof Error
                    ? `Не удалось сохранить файл: ${error.message}`
                    : 'Не удалось сохранить файл',
            })
        }
    }, [documentSession.name, documentSession.source, checkpointHistory, locale])

    const handleSaveDocument = useCallback(async () => {
        const handle = fileHandleRef.current
        if (!handle) {
            await handleSaveDocumentAs()
            return
        }

        const sourceToSave = documentSession.source
        const snapshot = { ...sessionRef.current }
        try {
            await writeTextCadDocument(handle, sourceToSave)
            let historyUnavailable = false
            try { await documentHistory.fileSession(handle.name, sourceToSave, handle, 'save', snapshot.id) }
            catch { historyUnavailable = true }
            if (sessionRef.current.id !== snapshot.id) return
            setDocumentSession((current) => ({
                ...current,
                name: handle.name,
                savedSource: sourceToSave,
            }))
            void checkpointHistory({ ...snapshot, name: handle.name }, 'save')
            setStatus({ level: historyUnavailable ? 'WARN' : 'INFO', text: historyUnavailable ? `${handle.name} сохранён; локальная история недоступна` : `${handle.name} сохранён` })
        } catch (error) {
            setStatus({
                level: 'ERROR',
                text: error instanceof Error
                    ? `Не удалось сохранить файл: ${error.message}`
                    : 'Не удалось сохранить файл',
            })
        }
    }, [documentSession.source, handleSaveDocumentAs, checkpointHistory])

    const handleRestoreVersion = async (version: HistoryVersion) => {
        const snapshot = { ...sessionRef.current }
        if (version.documentId !== snapshot.id || version.source === snapshot.source) return false
        if (!await restoreHistory(snapshot, version)) return false
        if (sessionRef.current.id !== snapshot.id || sessionRef.current.source !== snapshot.source) {
            setStatus({ level: 'WARN', text: 'Документ изменился во время восстановления. Выберите версию ещё раз.' })
            return false
        }
        handleSourceChange(version.source)
        setPanelTab('source')
        return true
    }

    const validateAiProposal = useCallback(async (candidateSource: string) => {
        const revisionId = 0

        try {
            await initCad()
            const parsed = parseTextCad(candidateSource, { revisionId })
            if (parsed.diagnostics.length > 0) return parsed.diagnostics

            const analyzed = analyzeTextCad(parsed.document, { revisionId })
            if (analyzed.diagnostics.length > 0) return analyzed.diagnostics

            const evaluated = evaluateTextCad(analyzed.program, { revisionId })
            if (evaluated.diagnostics.length > 0) {
                disposeSolids(evaluated)
                return evaluated.diagnostics
            }
            if (!evaluated.roots[0]) {
                disposeSolids(evaluated)
                return [runtimeDiagnostic('DSL не опубликовал корневую модель.', revisionId)]
            }

            disposeSolids(evaluated)
            return []
        } catch (error) {
            return [runtimeDiagnostic(
                error instanceof Error ? error.message : 'Не удалось проверить предложение ИИ.',
                revisionId,
            )]
        }
    }, [])

    return (
        <main className="app-shell" data-theme={theme}>
            <AppHeader
                documentName={displayName}
                isDocumentDirty={isDocumentDirty}
                theme={theme}
                isLeftPanelOpen={isLeftPanelOpen}
                isRightPanelOpen={isRightPanelOpen}
                onToggleTheme={() => {
                    setTheme((current) => current === 'dark' ? 'light' : 'dark')
                }}
                onToggleLeftPanel={() => setIsLeftPanelOpen((isOpen) => !isOpen)}
                onToggleRightPanel={() => setIsRightPanelOpen((isOpen) => !isOpen)}
                onNewDocument={handleNewDocument}
                onOpenDocument={handleOpenDocument}
                onSaveDocument={handleSaveDocument}
                onSaveDocumentAs={handleSaveDocumentAs}
                onOpenHistory={() => { setIsRightPanelOpen(true); setPanelTab('history') }}
            />

            <div className="app-workspace">
                {isLeftPanelOpen && (
                    <LeftTree
                        documentName={displayName}
                        sketches={modelInfo.sketches}
                        bodies={modelInfo.bodies}
                        isStale={sourceState !== 'synced'}
                        width={leftPanelWidth}
                        selection={selection}
                        hovered={hovered}
                        collapsedNodes={collapsedNodes}
                        onToggleNode={handleToggleNode}
                        onSelect={handleSelect}
                        onHover={handleHover}
                        onClose={() => { setIsLeftPanelOpen(false); setHovered(null) }}
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

                <Viewport mesh={mesh} status={status} theme={theme}
                    bodies={modelInfo.bodies} selection={selection} hovered={hovered}
                    onSelect={handleSelect} onHover={handleHover} />

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
                        key={documentSession.id}
                        documentName={displayName}
                        source={source}
                        diagnostics={diagnostics}
                        sourceState={sourceState}
                        width={rightPanelWidth}
                        onSourceChange={handleSourceChange}
                        activeTab={panelTab}
                        onTabChange={setPanelTab}
                        history={{ versions: history.versions, loading: history.loading, error: history.error || draftError }}
                        onCheckpoint={() => checkpointHistory({ ...sessionRef.current }, 'checkpoint')}
                        onRestoreVersion={handleRestoreVersion}
                        onValidateProposal={validateAiProposal}
                        onClose={() => setIsRightPanelOpen(false)}
                    />
                )}
            </div>
        </main>
    )
}

export default App
