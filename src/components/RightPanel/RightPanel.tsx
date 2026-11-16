import { useState } from 'react'
import './RightPanel.css'

type PanelTab = 'chat' | 'source'

type RightPanelProps = {
    source: string
    width: number
    onClose: () => void
}

function RightPanel({ source, width, onClose }: RightPanelProps) {
    const [activeTab, setActiveTab] = useState<PanelTab>('source')

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
                    <pre className="right-panel__source">{source}</pre>
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

            <div className="right-panel__status">
                <span className="right-panel__status-dot" aria-hidden="true" />
                Синхронизировано с моделью
            </div>
        </aside>
    )
}

export default RightPanel
