import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { requestAiEdit, type AiChatHistoryItem, type AiEditProposal } from '../../ai/client'
import { buildLineDiff } from '../../ai/diff'
import type { Diagnostic } from '../../dsl'
import './RightPanel.css'

type PanelTab = 'chat' | 'source'

type RightPanelProps = {
    documentName: string
    source: string
    diagnostics: Diagnostic[]
    sourceState: 'building' | 'synced' | 'error'
    width: number
    onSourceChange: (source: string) => void
    onValidateProposal: (source: string) => Promise<Diagnostic[]>
    onClose: () => void
}

type ChatMessage = AiChatHistoryItem & {
    id: number
}

type PendingProposal = AiEditProposal & {
    baseSource: string
}

const SOURCE_STATUS = {
    building: 'Пересчёт модели...',
    synced: 'Синхронизировано с моделью',
    error: 'Есть ошибки · показана последняя модель',
} as const

function RightPanel({
    documentName,
    source,
    diagnostics,
    sourceState,
    width,
    onSourceChange,
    onValidateProposal,
    onClose,
}: RightPanelProps) {
    const [activeTab, setActiveTab] = useState<PanelTab>('source')
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [prompt, setPrompt] = useState('')
    const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null)
    const [isSending, setIsSending] = useState(false)
    const [chatError, setChatError] = useState('')
    const editorRef = useRef<HTMLTextAreaElement>(null)
    const sourceRef = useRef(source)
    const nextMessageId = useRef(1)

    useEffect(() => {
        sourceRef.current = source
    }, [source])

    const proposalDiff = useMemo(() => (
        pendingProposal
            ? buildLineDiff(pendingProposal.baseSource, pendingProposal.source)
            : []
    ), [pendingProposal])

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

    const addMessage = (role: ChatMessage['role'], text: string) => {
        const message = { id: nextMessageId.current, role, text }
        nextMessageId.current += 1
        setMessages((current) => [...current, message])
    }

    const sendMessage = async () => {
        const message = prompt.trim()
        if (!message || isSending) return

        const baseSource = sourceRef.current
        const history = messages.map(({ role, text }) => ({ role, text }))
        addMessage('user', message)
        setPrompt('')
        setPendingProposal(null)
        setChatError('')
        setIsSending(true)

        try {
            const proposal = await requestAiEdit({
                message,
                source: baseSource,
                diagnostics,
                history,
            })
            addMessage('assistant', proposal.message)

            if (!proposal.changed) return
            if (sourceRef.current !== baseSource) {
                setChatError('Документ изменился, пока ИИ отвечал. Отправьте запрос ещё раз.')
                return
            }

            const proposalDiagnostics = await onValidateProposal(proposal.source)
            if (proposalDiagnostics.length > 0) {
                const first = proposalDiagnostics[0]
                setChatError(
                    `Предложение не прошло проверку: ${first.code} · ${first.sourceSpan.start.line}:${first.sourceSpan.start.column} · ${first.message}`,
                )
                return
            }

            setPendingProposal({ ...proposal, baseSource })
        } catch (error) {
            setChatError(error instanceof Error ? error.message : 'ИИ-помощник сейчас недоступен.')
        } finally {
            setIsSending(false)
        }
    }

    const submitMessage = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        void sendMessage()
    }

    const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void sendMessage()
        }
    }

    const applyProposal = () => {
        if (!pendingProposal) return
        if (sourceRef.current !== pendingProposal.baseSource) {
            setPendingProposal(null)
            setChatError('Документ уже изменился. Попросите ИИ подготовить предложение заново.')
            return
        }

        onSourceChange(pendingProposal.source)
        setPendingProposal(null)
        setChatError('')
        addMessage('assistant', 'Изменения применены к Source. Сохраните файл, когда будете готовы.')
    }

    const rejectProposal = () => {
        setPendingProposal(null)
        setChatError('')
        addMessage('assistant', 'Предложение отклонено, документ не изменён.')
    }

    const displayedState = activeTab === 'chat'
        ? (isSending ? 'building' : chatError ? 'error' : 'synced')
        : sourceState
    const displayedStatus = activeTab === 'chat'
        ? (isSending ? 'ИИ готовит предложение...' : chatError ? 'Нужна проверка' : 'ИИ-помощник готов')
        : SOURCE_STATUS[sourceState]

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
                    <div className="right-panel__chat-messages" aria-live="polite">
                        {messages.length === 0 && (
                            <div className="right-panel__empty">
                                <span className="right-panel__empty-icon" aria-hidden="true">✦</span>
                                <strong>TextCAD Assistant</strong>
                                <span>
                                    Опишите изменение в {documentName}. ИИ предложит новый Source,
                                    но применит его только после вашей проверки.
                                </span>
                            </div>
                        )}

                        {messages.map((message) => (
                            <div
                                className={`right-panel__message right-panel__message--${message.role}`}
                                key={message.id}
                            >
                                <span className="right-panel__message-author">
                                    {message.role === 'user' ? 'Вы' : 'ИИ'}
                                </span>
                                <p>{message.text}</p>
                            </div>
                        ))}

                        {isSending && (
                            <div className="right-panel__thinking">
                                <span />
                                <span />
                                <span />
                            </div>
                        )}

                        {chatError && (
                            <div className="right-panel__chat-error" role="alert">
                                {chatError}
                            </div>
                        )}
                    </div>

                    {pendingProposal && (
                        <section className="right-panel__proposal" aria-label="Предложение ИИ">
                            <div className="right-panel__proposal-header">
                                <strong>Проверенное изменение</strong>
                                <span>Source ещё не изменён</span>
                            </div>
                            <div className="right-panel__diff" aria-label="Сравнение исходного кода">
                                {proposalDiff.map((line, index) => (
                                    <div
                                        className="right-panel__diff-line"
                                        data-kind={line.kind}
                                        key={`${line.kind}-${line.oldLine}-${line.newLine}-${index}`}
                                    >
                                        <span className="right-panel__diff-marker" aria-hidden="true">
                                            {line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '}
                                        </span>
                                        <code>{line.text || ' '}</code>
                                    </div>
                                ))}
                            </div>
                            <div className="right-panel__proposal-actions">
                                <button type="button" onClick={rejectProposal}>Отклонить</button>
                                <button type="button" data-primary onClick={applyProposal}>Применить</button>
                            </div>
                        </section>
                    )}

                    <form className="right-panel__composer" onSubmit={submitMessage}>
                        <textarea
                            value={prompt}
                            rows={3}
                            aria-label="Сообщение ИИ-помощнику"
                            placeholder="Например: сделай корпус выше на 5 мм"
                            disabled={isSending}
                            onChange={(event) => setPrompt(event.target.value)}
                            onKeyDown={handleComposerKeyDown}
                        />
                        <div className="right-panel__composer-footer">
                            <span>Enter — отправить · Shift+Enter — строка</span>
                            <button type="submit" disabled={isSending || prompt.trim().length === 0}>
                                Отправить
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="right-panel__status" data-state={displayedState}>
                <span className="right-panel__status-dot" aria-hidden="true" />
                <span>{displayedStatus}</span>
            </div>
        </aside>
    )
}

export default RightPanel
