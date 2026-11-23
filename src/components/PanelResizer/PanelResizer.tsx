import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../../i18n/localeContext'
import './PanelResizer.css'

type PanelResizerProps = {
    side: 'left' | 'right'
    value: number
    min: number
    max: number
    onChange: (value: number) => void
}

function PanelResizer({
    side,
    value,
    min,
    max,
    onChange,
}: PanelResizerProps) {
    const { t } = useLocale()
    const [isDragging, setIsDragging] = useState(false)
    const cleanupRef = useRef<(() => void) | null>(null)

    const clamp = (nextValue: number) => Math.min(max, Math.max(min, nextValue))

    useEffect(() => () => cleanupRef.current?.(), [])

    const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault()

        const startX = event.clientX
        const startWidth = value
        const previousCursor = document.body.style.cursor
        const previousUserSelect = document.body.style.userSelect

        setIsDragging(true)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'

        const handlePointerMove = (moveEvent: PointerEvent) => {
            const distance = moveEvent.clientX - startX
            const nextWidth = side === 'left'
                ? startWidth + distance
                : startWidth - distance

            onChange(clamp(nextWidth))
        }

        const stopResize = () => {
            window.removeEventListener('pointermove', handlePointerMove)
            window.removeEventListener('pointerup', stopResize)
            window.removeEventListener('pointercancel', stopResize)
            document.body.style.cursor = previousCursor
            document.body.style.userSelect = previousUserSelect
            setIsDragging(false)
            cleanupRef.current = null
        }

        cleanupRef.current?.()
        cleanupRef.current = stopResize

        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('pointerup', stopResize)
        window.addEventListener('pointercancel', stopResize)
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

        event.preventDefault()

        const screenDirection = event.key === 'ArrowRight' ? 1 : -1
        const widthDirection = side === 'left' ? screenDirection : -screenDirection
        onChange(clamp(value + widthDirection * 10))
    }

    return (
        <div
            className={`panel-resizer panel-resizer--${side}${isDragging ? ' panel-resizer--dragging' : ''}`}
            role="separator"
            aria-label={t(side === 'left'
                ? 'Изменить ширину дерева модели'
                : 'Изменить ширину панели Source')}
            aria-orientation="vertical"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={Math.round(value)}
            tabIndex={0}
            onPointerDown={startResize}
            onKeyDown={handleKeyDown}
        >
            <span className="panel-resizer__line" aria-hidden="true" />
            <span className="panel-resizer__grip" aria-hidden="true">
                <i />
                <i />
                <i />
            </span>
        </div>
    )
}

export default PanelResizer
