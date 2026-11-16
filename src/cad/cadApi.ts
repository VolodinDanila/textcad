import type {SketchCommand, ExtrudeCommand} from "./dslTypes.ts";
import {draw, Sketch, type Shape3D} from "replicad"

export function buildSketch(command: SketchCommand): Sketch {
    if (command.curves.length === 0) {
        throw new Error("Sketch contains no curves");
    }

    const first = command.curves[0];

    let pen = draw(first.start)

    for (const curve of command.curves) {
        switch (curve.type) {
            case "line":
                pen = pen.lineTo(curve.end)
                break;
            case "arc":
                pen = pen.threePointsArcTo(
                    curve.end,
                    curve.middle
                )
                break;
        }
    }

    const result = pen.close().sketchOnPlane("XY");

    if (!(result instanceof Sketch)) {
        throw new Error("Expected a single sketch");
    }

    return result;
}

export function buildExtrude(
    sketch: Sketch,
    command: ExtrudeCommand
): Shape3D {
    return sketch.extrude(command.distance)
}