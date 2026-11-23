import { useState } from 'react'
import type { EvaluatedSolidArtifact } from '../../dsl'
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
    onClose: () => void
}

function countLabel(count: number, one: string, few: string, many: string) {
    const modulo100 = count % 100
    const modulo10 = count % 10

    if (modulo100 >= 11 && modulo100 <= 14) return many
    if (modulo10 === 1) return one
    if (modulo10 >= 2 && modulo10 <= 4) return few
    return many
}

function LeftTree({
    documentName,
    sketches,
    bodies,
    isStale,
    width,
    onClose,
}: LeftTreeProps) {
    const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(() => new Set())
    const [selectedNode, setSelectedNode] = useState('document')

    const toggleNode = (node: string) => {
        setCollapsedNodes((current) => {
            const next = new Set(current)

            if (next.has(node)) {
                next.delete(node)
            } else {
                next.add(node)
            }

            return next
        })
    }

    const renderRow = ({
        id,
        label,
        depth,
        icon,
        expandable,
    }: {
        id: string
        label: string
        depth: number
        icon: 'document' | 'folder' | 'sketch' | 'body' | 'feature'
        expandable?: string
    }) => {
        const isExpanded = expandable ? !collapsedNodes.has(expandable) : undefined
        const isSelected = selectedNode === id

        return (
            <div
                key={id}
                className={`left-tree__row${isSelected ? ' left-tree__row--selected' : ''}`}
                style={{ '--tree-depth': depth } as React.CSSProperties}
                role="treeitem"
                aria-expanded={expandable ? isExpanded : undefined}
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => setSelectedNode(id)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedNode(id)
                    }
                }}
            >
                {expandable ? (
                    <button
                        className="left-tree__chevron"
                        type="button"
                        aria-label={isExpanded ? `Свернуть ${label}` : `Развернуть ${label}`}
                        tabIndex={-1}
                        onClick={(event) => {
                            event.stopPropagation()
                            toggleNode(expandable)
                        }}
                    >
                        {isExpanded ? '▾' : '▸'}
                    </button>
                ) : (
                    <span className="left-tree__chevron-spacer" />
                )}

                <span className={`left-tree__icon left-tree__icon--${icon}`} aria-hidden="true" />
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
            aria-label="Дерево модели"
            style={{ width, flexBasis: width }}
        >
            <div className="left-tree__header">
                <span>Model</span>
                <button
                    className="left-tree__close"
                    type="button"
                    aria-label="Закрыть дерево модели"
                    title="Закрыть дерево модели"
                    onClick={onClose}
                >
                    ×
                </button>
            </div>

            <div className="left-tree__content" role="tree" aria-label="Структура модели">
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
                            label: 'Эскизы',
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
                            label: 'Тела и операции',
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
                                        label: `${body.name}${body.published ? ' · результат' : ''}`,
                                        depth: 2,
                                        icon: 'body',
                                        expandable: bodyNode,
                                    })}

                                    {!collapsedNodes.has(bodyNode) && renderRow({
                                        id: `feature:${body.name}`,
                                        label: `${OPERATION_LABELS[body.operation]}${body.distance !== undefined ? ` · ${body.distance} мм` : ''}${body.count !== undefined ? ` · ${body.count} шт.` : ''}${body.angle !== undefined ? ` · ${body.angle}°` : ''}`,
                                        depth: 3,
                                        icon: 'feature',
                                    })}
                                    {!collapsedNodes.has(bodyNode) && body.inputs.map((input, index) => renderRow({
                                        id: `input:${body.name}:${index}`,
                                        label: `← ${input}`,
                                        depth: 4,
                                        icon: 'feature',
                                    }))}
                                </div>
                            )
                        })}
                    </>
                )}
            </div>

            <div className="left-tree__footer" data-stale={isStale || undefined}>
                <span className="left-tree__footer-dot" aria-hidden="true" />
                {bodies.length} {countLabel(bodies.length, 'операция', 'операции', 'операций')}
                {' · '}
                {sketches.length} {countLabel(sketches.length, 'эскиз', 'эскиза', 'эскизов')}
            </div>
        </aside>
    )
}

export default LeftTree
