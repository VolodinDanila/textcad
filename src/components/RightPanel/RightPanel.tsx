import { useRef, useState } from 'react'
import type { Diagnostic } from '../../dsl'
import './RightPanel.css'

type PanelTab = 'chat' | 'source'

type RightPanelProps = {
    source: string
    diagnostics: Diagnostic[]
    sourceState: 'building' | 'synced' | 'error'
    width: number
    onSourceChange: (source: string) => void
    onClose: () => void
}

const SOURCE_STATUS = {
    building: 'Пересчёт модели...',
    synced: 'Синхронизировано с моделью',
    error: 'Есть ошибки · показана последняя модель',
} as const

function RightPanel({
    source,
    diagnostics,
    sourceState,
    width,
    onSourceChange,
    onClose,
}: RightPanelProps) {
    const [activeTab, setActiveTab] = useState<PanelTab>('source')
    const editorRef = useRef<HTMLTextAreaElement>(null)

    const selectDiagnostic = (diagnostic: Diagnostic) => {
        const editor = editorRef.current
        if (!editor) return

        editor.focus()
        editor.setSelectionRange(
            diagnostic.sourceSpan.start.offset,
            Math.max(
                diagnostic.sourceSpan.start.offset + 1,
                diagnostic.sourceSpan.end.offset,
            ),
        )
    }

    return (
        <aside
            className="right-panel"
            aria-label="Боковая панель"
            style={{ width, flexBasis: width }}
        >
            <div className="right-panel__header">
                <div className="right-panel__tabs" role="tablist">
                    <button
                        className="right-panel__tab"
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'chat'}
                        onClick={() => setActiveTab('chat')}
                    >
                        Chat
                    </button>

                    <button
                        className="right-panel__tab"
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'source'}
                        onClick={() => setActiveTab('source')}
                    >
                        Source
                    </button>
                </div>

                <button
                    className="right-panel__close"
                    type="button"
                    aria-label="Закрыть панель"
                    title="Закрыть панель"
                    onClick={onClose}
                >
                    ×
                </button>
            </div>

            {activeTab === 'source' ? (
                <div
                    className="right-panel__content right-panel__content--source"
                    role="tabpanel"
                    aria-label="Source"
                >
                    <textarea
                        ref={editorRef}
                        className="right-panel__source-editor"
                        value={source}
                        aria-label="Исходный код TextCAD"
                        spellCheck={false}
                        onChange={(event) => onSourceChange(event.target.value)}
                    />

                    {diagnostics.length > 0 && (
                        <div
                            className="right-panel__diagnostics"
                            aria-label="Ошибки документа"
                            aria-live="polite"
                        >
                            {diagnostics.map((diagnostic, index) => (
                                <button
                                    className="right-panel__diagnostic"
                                    type="button"
                                    key={`${diagnostic.code}-${diagnostic.sourceSpan.start.offset}-${index}`}
                                    onClick={() => selectDiagnostic(diagnostic)}
                                >
                                    <span className="right-panel__diagnostic-meta">
                                        {diagnostic.code}
                                        {' · '}
                                        {diagnostic.sourceSpan.start.line}:{diagnostic.sourceSpan.start.column}
                                    </span>
                                    <span className="right-panel__diagnostic-message">
                                        {diagnostic.message}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div
                    className="right-panel__content right-panel__content--chat"
                    role="tabpanel"
                    aria-label="Chat"
                >
                    <div className="right-panel__empty">
                        <span className="right-panel__empty-icon" aria-hidden="true">◌</span>
                        <strong>Чат пока не подключён</strong>
                        <span>Здесь появится диалог с CAD-помощником.</span>
                    </div>
                </div>
            )}

            <div className="right-panel__status" data-state={sourceState}>
                <span className="right-panel__status-dot" aria-hidden="true" />
                <span>{SOURCE_STATUS[sourceState]}</span>
            </div>
        </aside>
    )
}

export default RightPanel
