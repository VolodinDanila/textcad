import { useState } from 'react'
import './LeftTree.css'

type LeftTreeProps = {
    documentName: string
    sketchName: string
    extrusionDistance: number
    width: number
    onClose: () => void
}

type ExpandableNode = 'document' | 'sketches' | 'bodies' | 'body'

function LeftTree({
    documentName,
    sketchName,
    extrusionDistance,
    width,
    onClose,
}: LeftTreeProps) {
    const [expandedNodes, setExpandedNodes] = useState<Set<ExpandableNode>>(
        () => new Set(['document', 'sketches', 'bodies', 'body']),
    )
    const [selectedNode, setSelectedNode] = useState('body')

    const toggleNode = (node: ExpandableNode) => {
        setExpandedNodes((current) => {
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
        expandable?: ExpandableNode
    }) => {
        const isExpanded = expandable ? expandedNodes.has(expandable) : undefined
        const isSelected = selectedNode === id

        return (
            <div
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

    const documentExpanded = expandedNodes.has('document')
    const sketchesExpanded = expandedNodes.has('sketches')
    const bodiesExpanded = expandedNodes.has('bodies')
    const bodyExpanded = expandedNodes.has('body')

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

                        {sketchesExpanded && renderRow({
                            id: 'sketch',
                            label: sketchName,
                            depth: 2,
                            icon: 'sketch',
                        })}

                        {renderRow({
                            id: 'bodies',
                            label: 'Тела',
                            depth: 1,
                            icon: 'folder',
                            expandable: 'bodies',
                        })}

                        {bodiesExpanded && (
                            <>
                                {renderRow({
                                    id: 'body',
                                    label: 'Body',
                                    depth: 2,
                                    icon: 'body',
                                    expandable: 'body',
                                })}

                                {bodyExpanded && renderRow({
                                    id: 'extrude',
                                    label: `Extrude · ${extrusionDistance} мм`,
                                    depth: 3,
                                    icon: 'feature',
                                })}
                            </>
                        )}
                    </>
                )}
            </div>

            <div className="left-tree__footer">
                <span className="left-tree__footer-dot" aria-hidden="true" />
                1 тело · 1 эскиз
            </div>
        </aside>
    )
}

export default LeftTree
