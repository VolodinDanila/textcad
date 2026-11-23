import { useMemo, useState } from 'react'
import { buildLineDiff } from '../../ai/diff'
import { HISTORY_LABELS, type HistoryVersion } from '../../files/documentHistory'
import './HistoryPanel.css'

type HistoryPanelProps = {
    source: string
    versions: HistoryVersion[]
    loading: boolean
    error: string
    onCheckpoint: () => Promise<boolean>
    onRestore: (version: HistoryVersion) => Promise<boolean>
}
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const sizeLabel = (bytes: number) => bytes < 1024 ? `${bytes} Б` : `${(bytes / 1024).toFixed(1)} КБ`

function HistoryPanel({ source, versions, loading, error, onCheckpoint, onRestore }: HistoryPanelProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [localError, setLocalError] = useState('')
    const selected = versions.find((version) => version.id === selectedId) ?? versions[0]
    const diff = useMemo(() => {
        if (!selected) return []
        // LCS comparison is quadratic. Large versions remain fully readable as text.
        if (source === selected.source || source.length + selected.source.length > 200000
            || source.split('\n').length * selected.source.split('\n').length > 2000000) return null
        return buildLineDiff(source, selected.source)
    }, [source, selected])
    const matchesCurrent = selected?.source === source
    const perform = async (operation: () => Promise<boolean>) => {
        setBusy(true); setLocalError('')
        try { await operation() }
        catch { setLocalError('Операция не завершена. Текущий Source сохранён в редакторе.') }
        finally { setBusy(false) }
    }

    return (
        <section className="history-panel" role="tabpanel" aria-label="История файла">
            <div className="history-panel__header">
                <strong>История файла</strong>
                <span>Только в этом браузере · версий: {versions.length}</span>
                <button type="button" disabled={busy || loading} onClick={() => void perform(onCheckpoint)}>
                    Сохранить версию
                </button>
            </div>
            {(error || localError) && <p className="history-panel__error" role="alert">{error || localError}</p>}
            <div className="history-panel__versions" aria-label="Версии документа">
                {loading && <p className="history-panel__empty">Загрузка истории…</p>}
                {!loading && versions.length === 0 && <p className="history-panel__empty">Версий пока нет. Сохраните первую контрольную точку.</p>}
                {versions.map((version) => (
                    <button type="button" className="history-panel__version" key={version.id}
                        aria-pressed={selected?.id === version.id} disabled={busy}
                        onClick={() => { setSelectedId(version.id); setLocalError('') }}>
                        <span>{HISTORY_LABELS[version.reason]}</span>
                        <time dateTime={new Date(version.createdAt).toISOString()}>{dateFormat.format(version.createdAt)}</time>
                        <small>{sizeLabel(version.bytes)}{version.source === source ? ' · совпадает с Source' : ''}</small>
                    </button>
                ))}
            </div>
            {selected && (
                <div className="history-panel__preview">
                    <div className="history-panel__preview-title">
                        <strong>{diff === null ? 'Исходный код версии' : 'Изменения при восстановлении'}</strong>
                        <span>{matchesCurrent ? 'Эта версия совпадает с текущей' : diff === null ? 'Показан Source выбранной версии целиком' : 'Source ещё не изменён'}</span>
                    </div>
                    {diff === null ? (
                        <textarea className="history-panel__source" readOnly value={selected.source}
                            aria-label="Исходный код выбранной версии" />
                    ) : <div className="right-panel__diff" aria-label="Сравнение версии с текущим Source">
                        {diff.map((line, index) => (
                            <div className="right-panel__diff-line" data-kind={line.kind} key={index}>
                                <span className="right-panel__diff-marker" aria-hidden="true">{line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '}</span>
                                <code>{line.text || ' '}</code>
                            </div>
                        ))}
                    </div>}
                    <div className="history-panel__restore">
                        <span>Текущий вариант останется в истории. Файл на диске сохраните отдельно.</span>
                        <button type="button" data-primary disabled={busy || matchesCurrent || loading}
                            onClick={() => void perform(() => onRestore(selected))}>
                            {busy ? 'Сохранение…' : 'Восстановить версию'}
                        </button>
                    </div>
                </div>
            )}
            <details className="history-panel__limits">
                <summary>Как хранится история</summary>
                <p>Только текст Source: до 100 версий и 5 МБ на документ, до 25 МБ и 100 документов суммарно.
                    При заполнении удаляются старые автоматические версии, затем старые контрольные точки;
                    при общем лимите — история давно не открывавшихся файлов.
                    Очистка данных сайта удалит историю. В файл .textcad она не включается.</p>
            </details>
        </section>
    )
}
export default HistoryPanel
