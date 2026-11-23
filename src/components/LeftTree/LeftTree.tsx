import { useEffect, useRef } from 'react'
import type { EvaluatedSolidArtifact } from '../../dsl'
import { useLocale } from '../../i18n/localeContext'
import { countNoun } from '../../i18n/messages'
import CadIcon, { type CadIconName } from './CadIcon'
import { relatedBodyNames, type ModelTarget } from '../../cad/modelSelection'
import './LeftTree.css'

type BodyItem = {
    name: string
    operation: EvaluatedSolidArtifact['operation']
    distance?: number
    angle?: number
    count?: number
    inputs: string[]
    published: boolean
}

const OPERATION_LABELS = {
    extrude: 'Выдавливание',
    union: 'Объединение',
    cut: 'Вычитание',
    intersect: 'Пересечение',
    revolve: 'Вращение',
    'pattern-circular': 'Круговой массив',
    'pattern-linear': 'Линейный массив',
    loft: 'По сечениям',
    fillet: 'Скругление',
    chamfer: 'Фаска',
    shell: 'Оболочка',
    translate: 'Перемещение',
    rotate: 'Поворот',
    mirror: 'Зеркальное отражение',
    scale: 'Масштабирование',
    hole: 'Отверстие',
    thread: 'Резьба',
} as const

type LeftTreeProps = {
    documentName: string
    sketches: string[]
    bodies: BodyItem[]
    isStale: boolean
    width: number
    selection: ModelTarget | null
    hovered: ModelTarget | null
    collapsedNodes: ReadonlySet<string>
    onToggleNode: (node: string) => void
    onSelect: (target: ModelTarget | null) => void
    onHover: (target: ModelTarget | null) => void
    onClose: () => void
}

function LeftTree({
    documentName,
    sketches,
    bodies,
    isStale,
    width,
    selection,
    hovered,
    collapsedNodes,
    onToggleNode,
    onSelect,
    onHover,
    onClose,
}: LeftTreeProps) {
    const { locale, t, number } = useLocale()
    const rowRefs = useRef(new Map<string, HTMLDivElement>())
    const relatedNames = new Set(relatedBodyNames(selection, bodies))
    const hoveredNames = new Set(relatedBodyNames(hovered, bodies))

    useEffect(() => {
        if (selection) rowRefs.current.get(selection.nodeId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }, [selection, collapsedNodes])

    const renderRow = ({
        id,
        label,
        depth,
        icon,
        expandable,
        targetId = id,
    }: {
        id: string
        label: string
        depth: number
        icon: CadIconName
        expandable?: string
        targetId?: string
    }) => {
        const isExpanded = expandable ? !collapsedNodes.has(expandable) : undefined
        const isSelected = selection?.nodeId === id
        const isBody = id.startsWith('body:')
        const bodyName = id.slice('body:'.length)
        const isRelated = isBody && !isSelected && relatedNames.has(bodyName)
        const isHovered = hovered?.nodeId === id || (isBody && hoveredNames.has(bodyName))

        return (
            <div
                key={id}
                ref={(element) => { if (element) rowRefs.current.set(id, element); else rowRefs.current.delete(id) }}
                data-node-id={id}
                className={`left-tree__row${isSelected ? ' left-tree__row--selected' : ''}${isRelated ? ' left-tree__row--related' : ''}${isHovered ? ' left-tree__row--hovered' : ''}`}
                style={{ '--tree-depth': depth } as React.CSSProperties}
                role="treeitem"
                aria-expanded={expandable ? isExpanded : undefined}
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => onSelect({ nodeId: targetId })}
                onPointerEnter={() => onHover({ nodeId: targetId })}
                onPointerLeave={() => onHover(null)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onSelect({ nodeId: targetId })
                    } else if (event.key === 'Escape') {
                        event.preventDefault()
                        onSelect(null)
                        onHover(null)
                    }
                }}
            >
                {expandable ? (
                    <button
                        className="left-tree__chevron"
                        type="button"
                        aria-label={t(isExpanded ? 'Свернуть {name}' : 'Развернуть {name}', { name: label })}
                        tabIndex={-1}
                        onClick={(event) => {
                            event.stopPropagation()
                            onToggleNode(expandable)
                        }}
                    >
                        {isExpanded ? '▾' : '▸'}
                    </button>
                ) : (
                    <span className="left-tree__chevron-spacer" />
                )}

                <span className={`left-tree__icon left-tree__icon--${icon}`}><CadIcon name={icon} /></span>
                <span className="left-tree__label" title={label}>{label}</span>
            </div>
        )
    }

    const documentExpanded = !collapsedNodes.has('document')
    const sketchesExpanded = !collapsedNodes.has('sketches')
    const bodiesExpanded = !collapsedNodes.has('bodies')

    return (
        <aside
            className="left-tree"
            aria-label={t('Дерево модели')}
            style={{ width, flexBasis: width }}
        >
            <div className="left-tree__header">
                <span>{t('Model')}</span>
                <button
                    className="left-tree__close"
                    type="button"
                    aria-label={t('Закрыть дерево модели')}
                    title={t('Закрыть дерево модели')}
                    onClick={onClose}
                >
                    ×
                </button>
            </div>

            <div className="left-tree__content" role="tree" aria-label={t('Структура модели')}>
                {renderRow({
                    id: 'document',
                    label: documentName,
                    depth: 0,
                    icon: 'document',
                    expandable: 'document',
                })}

                {documentExpanded && (
                    <>
                        {renderRow({
                            id: 'sketches',
                            label: t('Эскизы'),
                            depth: 1,
                            icon: 'folder',
                            expandable: 'sketches',
                        })}

                        {sketchesExpanded && sketches.map((name) => renderRow({
                            id: `sketch:${name}`,
                            label: name,
                            depth: 2,
                            icon: 'sketch',
                        }))}

                        {renderRow({
                            id: 'bodies',
                            label: t('Тела и операции'),
                            depth: 1,
                            icon: 'folder',
                            expandable: 'bodies',
                        })}

                        {bodiesExpanded && bodies.map((body) => {
                            const bodyNode = `body:${body.name}`
                            return (
                                <div key={bodyNode}>
                                    {renderRow({
                                        id: bodyNode,
                                        label: `${body.name}${body.published ? ` · ${t('результат')}` : ''}`,
                                        depth: 2,
                                        icon: 'body',
                                        expandable: bodyNode,
                                    })}

                                    {!collapsedNodes.has(bodyNode) && renderRow({
                                        id: `feature:${body.name}`,
                                        label: `${t(OPERATION_LABELS[body.operation])}${body.distance !== undefined ? ` · ${number(body.distance)} ${t('мм')}` : ''}${body.count !== undefined ? ` · ${number(body.count)} ${t('шт.')}` : ''}${body.angle !== undefined ? ` · ${number(body.angle)}°` : ''}`,
                                        depth: 3,
                                        icon: body.operation,
                                    })}
                                    {!collapsedNodes.has(bodyNode) && body.inputs.map((input, index) => renderRow({
                                        id: `input:${body.name}:${index}`,
                                        targetId: `${sketches.includes(input) ? 'sketch' : 'body'}:${input}`,
                                        label: input,
                                        depth: 4,
                                        icon: 'link',
                                    }))}
                                </div>
                            )
                        })}
                    </>
                )}
            </div>

            <div className="left-tree__footer" data-stale={isStale || undefined}>
                <span className="left-tree__footer-dot" aria-hidden="true" />
                {number(bodies.length)} {countNoun(bodies.length, 'feature', locale)}
                {' · '}
                {number(sketches.length)} {countNoun(sketches.length, 'sketch', locale)}
            </div>
        </aside>
    )
}

export default LeftTree
