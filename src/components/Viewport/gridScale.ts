/** Keep a useful screen density while displaying meaningful millimetre intervals. */
export function gridSpacing(worldUnitsPerPixel: number, current?: number): number {
    const pixels = current ? current / worldUnitsPerPixel : 0
    // Hysteresis prevents flickering between steps during small camera movements.
    if (pixels >= 10 && pixels <= 26) return current!
    const desired = Math.max(worldUnitsPerPixel, 1e-12) * 16
    const decade = 10 ** Math.floor(Math.log10(desired))
    const candidates = [1, 2, 5, 10].map((factor) => factor * decade)
    return candidates.reduce((best, step) => (
        Math.abs(Math.log(step / desired)) < Math.abs(Math.log(best / desired)) ? step : best
    ))
}

export function gridViewMetrics(distance: number, fovDegrees: number, height: number, radius: number) {
    const viewHeight = 2 * distance * Math.tan(fovDegrees * Math.PI / 360)
    const extent = Math.max(distance * 16, radius * 12)
    return {
        worldUnitsPerPixel: viewHeight / Math.max(height, 1),
        extent,
        fadeStart: extent * 0.35,
        fadeEnd: extent * 0.9,
        near: Math.max(distance / 10000, radius / 100000, 1e-7),
        far: Math.max(distance + extent * 2, radius * 32, 1),
    }
}

const spacingFormat = new Intl.NumberFormat('ru-RU', { maximumSignificantDigits: 4, useGrouping: false })
export const formatGridSpacing = (spacing: number) => spacingFormat.format(spacing)
