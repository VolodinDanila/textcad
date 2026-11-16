export type Point2D = [number, number];

export type LineCommand = {
    type: 'line';
    start: Point2D;
    end: Point2D;
}

export type ArcCommand = {
    type: 'arc';
    start: Point2D;
    middle: Point2D;
    end: Point2D;
}

export type SketchPlane = 'XY' | 'XZ' | 'YZ'

export type SketchCommand = {
    type: 'sketch';
    name: string;
    plane: SketchPlane;
    curves: Array<LineCommand | ArcCommand>;
}

export type ExtrudeCommand = {
    type: 'extrude';
    sketch: string;
    distance: number;
}