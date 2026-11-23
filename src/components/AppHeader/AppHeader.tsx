import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../../i18n/localeContext'
import type { MessageKey } from '../../i18n/messages'
import './AppHeader.css'

type MenuDefinition = {
    label: MessageKey
    items: Array<{
        id: string
        label: MessageKey
        shortcut?: string
        action?: 'new' | 'open' | 'save' | 'saveAs' | 'history'
    }>
}

const menus: MenuDefinition[] = [
    {
        label: 'File',
        items: [
            { id: 'new', label: 'New', shortcut: 'Ctrl+N', action: 'new' },
            { id: 'open', label: 'Open…', shortcut: 'Ctrl+O', action: 'open' },
            { id: 'save', label: 'Save', shortcut: 'Ctrl+S', action: 'save' },
            { id: 'save-as', label: 'Save As…', shortcut: 'Ctrl+Shift+S', action: 'saveAs' },
            { id: 'history', label: 'История версий…', action: 'history' },
            { id: 'import', label: 'Import…' },
            { id: 'export', label: 'Export…' },
        ],
    },
    {
        label: 'Edit',
        items: [
            { id: 'undo', label: 'Undo' },
            { id: 'redo', label: 'Redo' },
            { id: 'preferences', label: 'Preferences…' },
        ],
    },
    {
        label: 'View',
        items: [
            { id: 'fit-view', label: 'Fit view' },
            { id: 'grid', label: 'Grid' },
            { id: 'axes', label: 'Axes' },
            { id: 'projection', label: 'Projection' },
        ],
    },
    {
        label: 'Tools',
        items: [
            { id: 'measure', label: 'Measure' },
            { id: 'section', label: 'Section' },
            { id: 'model-inspector', label: 'Model inspector' },
        ],
    },
    {
        label: 'Help',
        items: [
            { id: 'quick-start', label: 'Quick start' },
            { id: 'shortcuts', label: 'Keyboard shortcuts' },
            { id: 'about', label: 'About' },
        ],
    },
]

type AppHeaderProps = {
    documentName: string
    isDocumentDirty: boolean
    theme: 'dark' | 'light'
    isLeftPanelOpen: boolean
    isRightPanelOpen: boolean
    onToggleTheme: () => void
    onToggleLeftPanel: () => void
    onToggleRightPanel: () => void
    onNewDocument: () => void
    onOpenDocument: () => void | Promise<void>
    onSaveDocument: () => void | Promise<void>
    onSaveDocumentAs: () => void | Promise<void>
    onOpenHistory: () => void
}

function AppHeader({
    documentName,
    isDocumentDirty,
    theme,
    isLeftPanelOpen,
    isRightPanelOpen,
    onToggleTheme,
    onToggleLeftPanel,
    onToggleRightPanel,
    onNewDocument,
    onOpenDocument,
    onSaveDocument,
    onSaveDocumentAs,
    onOpenHistory,
}: AppHeaderProps) {
    const { locale, setLocale, t } = useLocale()
    const [openMenu, setOpenMenu] = useState<string | null>(null)
    const headerRef = useRef<HTMLElement>(null)
    const documentActions = {
        new: onNewDocument,
        open: onOpenDocument,
        save: onSaveDocument,
        saveAs: onSaveDocumentAs,
        history: onOpenHistory,
    }

    useEffect(() => {
        const handlePointerDown = (event: PointerEvent) => {
            if (!headerRef.current?.contains(event.target as Node)) {
                setOpenMenu(null)
            }
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpenMenu(null)
                return
            }

            if (!event.ctrlKey && !event.metaKey) return

            const key = event.key.toLowerCase()
            const action = key === 'n'
                ? onNewDocument
                : key === 'o'
                    ? onOpenDocument
                    : key === 's' && event.shiftKey
                        ? onSaveDocumentAs
                        : key === 's'
                            ? onSaveDocument
                            : null
            if (!action) return

            event.preventDefault()
            setOpenMenu(null)
            void action()
        }

        window.addEventListener('pointerdown', handlePointerDown)
        window.addEventListener('keydown', handleKeyDown)

        return () => {
            window.removeEventListener('pointerdown', handlePointerDown)
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [onNewDocument, onOpenDocument, onSaveDocument, onSaveDocumentAs])

    return (
        <header ref={headerRef} className="app-header">
            <div className="app-header__left">
                <div className="app-header__brand">{t('brand')}</div>

                <nav className="app-header__nav" aria-label={t('Главное меню')}>
                    {menus.map((menu) => {
                        const isOpen = openMenu === menu.label

                        return (
                            <div className="app-header__menu" key={menu.label}>
                                <button
                                    className="app-header__menu-trigger"
                                    type="button"
                                    aria-haspopup="menu"
                                    aria-expanded={isOpen}
                                    onClick={() => {
                                        setOpenMenu(isOpen ? null : menu.label)
                                    }}
                                >
                                    {t(menu.label)}
                                </button>

                                {isOpen && (
                                    <div
                                        className="app-header__dropdown"
                                        role="menu"
                                        aria-label={t(menu.label)}
                                    >
                                        {menu.items.map((item) => {
                                            const action = item.action
                                                ? documentActions[item.action]
                                                : undefined

                                            return (
                                                <button
                                                    className="app-header__dropdown-item"
                                                    type="button"
                                                    role="menuitem"
                                                    disabled={!action}
                                                    title={action ? undefined : t('Пока недоступно')}
                                                    key={item.id}
                                                    onClick={() => {
                                                        if (!action) return
                                                        setOpenMenu(null)
                                                        void action()
                                                    }}
                                                >
                                                    <span>{t(item.label, { brand: t('brand') })}</span>
                                                    <span
                                                        className="app-header__placeholder"
                                                        aria-hidden="true"
                                                    >
                                                        {item.shortcut ?? '—'}
                                                    </span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </nav>
            </div>

            <div
                className="app-header__document"
                title={isDocumentDirty
                    ? `${documentName} · ${t('Есть несохранённые изменения')}`
                    : documentName}
            >
                {documentName}
                <span
                    className="app-header__document-dot"
                    data-dirty={isDocumentDirty || undefined}
                    aria-hidden="true"
                />
            </div>

            <div className="app-header__right">
                <select className="app-header__language" aria-label={t('Язык интерфейса')} title={t('Язык интерфейса')}
                    value={locale} onChange={(event) => setLocale(event.target.value === 'en' ? 'en' : 'ru')}>
                    <option value="ru">RU</option><option value="en">EN</option>
                </select>
                <button
                    className="app-header__theme-toggle"
                    type="button"
                    aria-label={t(theme === 'light'
                        ? 'Включить тёмную тему'
                        : 'Включить светлую тему')}
                    title={t(theme === 'light'
                        ? 'Тёмная тема'
                        : 'Светлая тема')}
                    aria-pressed={theme === 'light'}
                    onClick={onToggleTheme}
                >
                    {theme === 'light' ? '☾' : '☀'}
                </button>
                <button
                    className="app-header__panel-toggle"
                    type="button"
                    aria-label={t(isLeftPanelOpen
                        ? 'Закрыть дерево модели'
                        : 'Открыть дерево модели')}
                    aria-pressed={isLeftPanelOpen}
                    title={t(isLeftPanelOpen
                        ? 'Закрыть дерево модели'
                        : 'Открыть дерево модели')}
                    onClick={onToggleLeftPanel}
                >
                    ☷
                </button>
                <button
                    className="app-header__panel-toggle"
                    type="button"
                    aria-label={t(isRightPanelOpen
                        ? 'Закрыть панель Source'
                        : 'Открыть панель Source')}
                    aria-pressed={isRightPanelOpen}
                    title={t(isRightPanelOpen
                        ? 'Закрыть панель Source'
                        : 'Открыть панель Source')}
                    onClick={onToggleRightPanel}
                >
                    &lt;/&gt;
                </button>
            </div>
        </header>
    )
}

export default AppHeader
