import assert from 'node:assert/strict'
import test from 'node:test'
import { formatGridSpacing, gridSpacing, gridViewMetrics } from '../../src/components/Viewport/gridScale.ts'

test('grid cells stay readable from millimetre parts to large models', () => {
    for (const distance of [0.01, 1, 10, 100, 1000, 1000000]) {
        for (const height of [300, 660, 2160]) {
            const { worldUnitsPerPixel } = gridViewMetrics(distance, 50, height, distance / 3)
            const spacing = gridSpacing(worldUnitsPerPixel)
            const pixels = spacing / worldUnitsPerPixel
            assert.ok(pixels >= 10 && pixels <= 26, `${distance}, ${height}: ${pixels}px`)
            const decade = 10 ** Math.floor(Math.log10(spacing))
            assert.ok([1, 2, 5].some((value) => Math.abs(spacing / decade - value) < 1e-8))
        }
    }
})

test('scaling a scene scales the millimetre grid instead of changing its apparent density', () => {
    const small = gridViewMetrics(20, 50, 700, 5)
    const large = gridViewMetrics(20000, 50, 700, 5000)
    assert.equal(gridSpacing(large.worldUnitsPerPixel) / gridSpacing(small.worldUnitsPerPixel), 1000)
})

test('minor camera jitter keeps the step, but substantial zoom changes it', () => {
    const current = gridSpacing(0.03)
    for (const pixelScale of [0.029, 0.03, 0.031]) assert.equal(gridSpacing(pixelScale, current), current)
    assert.notEqual(gridSpacing(0.1, current), current)
    assert.notEqual(gridSpacing(0.003, current), current)
})

test('grid fading starts well beyond the model and has no fixed millimetre cap', () => {
    for (const distance of [0.1, 50, 5000]) {
        const metrics = gridViewMetrics(distance, 50, 700, distance / 3)
        assert.ok(metrics.fadeStart > distance * 4)
        assert.ok(metrics.fadeEnd > metrics.fadeStart)
        assert.ok(metrics.fadeEnd < metrics.extent)
    }
    assert.ok(gridViewMetrics(5000, 50, 700, 1000).fadeStart > 10000)
})

test('clipping planes include the full grid and a fitted model at every scale', () => {
    for (const radius of [0.001, 5, 300, 100000]) {
        const distance = radius * 3
        const metrics = gridViewMetrics(distance, 50, 700, radius)
        assert.ok(metrics.near > 0 && metrics.near < distance - radius)
        assert.ok(metrics.far > distance + metrics.extent)
    }
})

test('the scale label preserves fractional millimetres and small values', () => {
    assert.equal(formatGridSpacing(0.5), '0,5')
    assert.equal(formatGridSpacing(0.0002), '0,0002')
    assert.equal(formatGridSpacing(1000), '1000')
})
