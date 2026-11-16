import {
    buildSketch,
    buildExtrude
} from '../cad/cadApi'

import type {
    SketchCommand,
    ExtrudeCommand
} from '../cad/dslTypes'

export const testSketchCommand: SketchCommand = {
    type: 'sketch',
    name: 'Sketch1',
    plane: 'XY',
    curves: [
        { type: 'line', start: [-50, -29], end: [-17, -29] },
        { type: 'line', start: [-17, -29], end: [0, -58] },
        { type: 'line', start: [0, -58], end: [17, -29] },
        { type: 'line', start: [17, -29], end: [50, -29] },

        { type: 'line', start: [50, -29], end: [33, 0] },
        { type: 'line', start: [33, 0], end: [50, 29] },
        { type: 'line', start: [50, 29], end: [17, 29] },
        { type: 'line', start: [17, 29], end: [0, 58] },

        { type: 'line', start: [0, 58], end: [-17, 29] },
        { type: 'line', start: [-17, 29], end: [-50, 29] },
        { type: 'line', start: [-50, 29], end: [-33, 0] },
        { type: 'line', start: [-33, 0], end: [-50, -29] },
    ],
}

export const testExtrudeCommand: ExtrudeCommand = {
    type: 'extrude',
    sketch: 'Sketch1',
    distance: 20,
}

function formatNumber(value: number) {
    return Number.isInteger(value) ? value.toFixed(1) : String(value)
}

export function getTestModelSource() {
    const curveLines = testSketchCommand.curves.map((curve) => {
        if (curve.type === 'line') {
            return `[line ${curve.start.map(formatNumber).join(' ')} ${curve.end.map(formatNumber).join(' ')}]`
        }

        return `[arc ${curve.start.map(formatNumber).join(' ')} ${curve.middle.map(formatNumber).join(' ')} ${curve.end.map(formatNumber).join(' ')}]`
    })

    return [
        '; Generated from ТекстВСАПР document',
        '',
        `[sketch "${testSketchCommand.name}" "${testSketchCommand.plane}"]`,
        ...curveLines,
        '[end-sketch]',
        '',
        `[let body [extrude "${testExtrudeCommand.sketch}" ${formatNumber(testExtrudeCommand.distance)}]]`,
        '[root body "default"]',
    ].join('\n')
}

export function buildTestModel() {
    const baseProfile = buildSketch(testSketchCommand)

    const body = buildExtrude(baseProfile, testExtrudeCommand)

    return body
}
