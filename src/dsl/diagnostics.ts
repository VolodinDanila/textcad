export type DiagnosticSeverity = 'error' | 'warning' | 'info'

export type ParseDiagnosticCode =
    | 'TCD-P001'
    | 'TCD-P002'
    | 'TCD-P003'
    | 'TCD-P004'

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
    code: ParseDiagnosticCode | (string & {})
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
