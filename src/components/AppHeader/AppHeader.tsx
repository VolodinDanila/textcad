import { useEffect, useRef, useState } from 'react'
import './AppHeader.css'

type MenuDefinition = {
    label: string
    items: string[]
}

const menus: MenuDefinition[] = [
    {
        label: 'File',
        items: ['New', 'Open…', 'Import…', 'Save', 'Export…'],
    },
    {
        label: 'Edit',
        items: ['Undo', 'Redo', 'Preferences…'],
    },
    {
        label: 'View',
        items: ['Fit view', 'Grid', 'Axes', 'Projection'],
    },
    {
        label: 'Tools',
        items: ['Measure', 'Section', 'Model inspector'],
    },
    {
        label: 'Help',
        items: ['Quick start', 'Keyboard shortcuts', 'About ТекстВСАПР'],
    },
]

type AppHeaderProps = {
    documentName: string
    theme: 'dark' | 'light'
    isLeftPanelOpen: boolean
    isRightPanelOpen: boolean
    onToggleTheme: () => void
    onToggleLeftPanel: () => void
    onToggleRightPanel: () => void
}

function AppHeader({
    documentName,
    theme,
    isLeftPanelOpen,
    isRightPanelOpen,
    onToggleTheme,
    onToggleLeftPanel,
    onToggleRightPanel,
}: AppHeaderProps) {
    const [openMenu, setOpenMenu] = useState<string | null>(null)
    const headerRef = useRef<HTMLElement>(null)

    useEffect(() => {
        const handlePointerDown = (event: PointerEvent) => {
            if (!headerRef.current?.contains(event.target as Node)) {
                setOpenMenu(null)
            }
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpenMenu(null)
            }
        }

        window.addEventListener('pointerdown', handlePointerDown)
        window.addEventListener('keydown', handleKeyDown)

        return () => {
            window.removeEventListener('pointerdown', handlePointerDown)
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [])

    return (
        <header ref={headerRef} className="app-header">
            <div className="app-header__left">
                <div className="app-header__brand">ТекстВСАПР</div>

                <nav className="app-header__nav" aria-label="Главное меню">
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
                                    {menu.label}
                                </button>

                                {isOpen && (
                                    <div
                                        className="app-header__dropdown"
                                        role="menu"
                                        aria-label={menu.label}
                                    >
                                        {menu.items.map((item) => (
                                            <button
                                                className="app-header__dropdown-item"
                                                type="button"
                                                role="menuitem"
                                                disabled
                                                title="Пока недоступно"
                                                key={item}
                                            >
                                                <span>{item}</span>
                                                <span
                                                    className="app-header__placeholder"
                                                    aria-hidden="true"
                                                >
                                                    —
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </nav>
            </div>

            <div className="app-header__document" title={documentName}>
                {documentName}
                <span className="app-header__document-dot" aria-hidden="true" />
            </div>

            <div className="app-header__right">
                <span className="app-header__mode" aria-hidden="true">CAD</span>
                <button
                    className="app-header__theme-toggle"
                    type="button"
                    aria-label={theme === 'light'
                        ? 'Включить тёмную тему'
                        : 'Включить светлую тему'}
                    title={theme === 'light'
                        ? 'Тёмная тема'
                        : 'Светлая тема'}
                    aria-pressed={theme === 'light'}
                    onClick={onToggleTheme}
                >
                    {theme === 'light' ? '☾' : '☀'}
                </button>
                <button
                    className="app-header__panel-toggle"
                    type="button"
                    aria-label={isLeftPanelOpen
                        ? 'Закрыть дерево модели'
                        : 'Открыть дерево модели'}
                    aria-pressed={isLeftPanelOpen}
                    title={isLeftPanelOpen
                        ? 'Закрыть дерево модели'
                        : 'Открыть дерево модели'}
                    onClick={onToggleLeftPanel}
                >
                    ☷
                </button>
                <button
                    className="app-header__panel-toggle"
                    type="button"
                    aria-label={isRightPanelOpen
                        ? 'Закрыть панель Source'
                        : 'Открыть панель Source'}
                    aria-pressed={isRightPanelOpen}
                    title={isRightPanelOpen
                        ? 'Закрыть панель Source'
                        : 'Открыть панель Source'}
                    onClick={onToggleRightPanel}
                >
                    &lt;/&gt;
                </button>
            </div>
        </header>
    )
}

export default AppHeader
