export type DiagnosticSeverity = 'error' | 'warning' | 'info'

export type ParseDiagnosticCode =
    | 'TCD-P001'
    | 'TCD-P002'
    | 'TCD-P003'
    | 'TCD-P004'

export type SemanticDiagnosticCode =
    | 'TCD-S001'
    | 'TCD-S002'
    | 'TCD-S003'
    | 'TCD-S004'
    | 'TCD-S005'
    | 'TCD-S006'
    | 'TCD-S007'
    | 'TCD-S008'

export type GeometryDiagnosticCode =
    | 'TCD-G001'
    | 'TCD-G002'
    | 'TCD-G003'
    | 'TCD-G004'
    | 'TCD-G005'
    | 'TCD-G006'
    | 'TCD-G007'

export type SourcePosition = {
    offset: number
    line: number
    column: number
}

export type SourceSpan = {
    start: SourcePosition
    end: SourcePosition
}

export type Diagnostic = {
    code: ParseDiagnosticCode | SemanticDiagnosticCode | GeometryDiagnosticCode | (string & {})
    severity: DiagnosticSeverity
    message: string
    sourceSpan: SourceSpan
    revisionId: number
    relatedSpans: SourceSpan[]
}

export function createParseDiagnostic(
    code: ParseDiagnosticCode,
    message: string,
    sourceSpan: SourceSpan,
    revisionId: number,
): Diagnostic {
    return {
        code,
        severity: 'error',
        message,
        sourceSpan,
        revisionId,
        relatedSpans: [],
    }
}

export function createSemanticDiagnostic(
    code: SemanticDiagnosticCode,
    message: string,
    sourceSpan: SourceSpan,
    revisionId: number,
    relatedSpans: SourceSpan[] = [],
): Diagnostic {
    return {
        code,
        severity: 'error',
        message,
        sourceSpan,
        revisionId,
        relatedSpans,
    }
}

export function createGeometryDiagnostic(
    code: GeometryDiagnosticCode,
    message: string,
    sourceSpan: SourceSpan,
    revisionId: number,
    relatedSpans: SourceSpan[] = [],
): Diagnostic {
    return {
        code,
        severity: 'error',
        message,
        sourceSpan,
        revisionId,
        relatedSpans,
    }
}
