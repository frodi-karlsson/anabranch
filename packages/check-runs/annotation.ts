/** Annotation attached to a check run for reporting issues. */
export interface Annotation {
  /** File path relative to repository root. */
  path: string
  /** Starting line number (1-indexed). */
  startLine: number
  /** Ending line number (1-indexed). */
  endLine: number
  /** Severity level of the annotation. */
  level: 'notice' | 'warning' | 'failure'
  /** Description of the issue. */
  message: string
  /** Title shown in the annotation. */
  title?: string
  /** Raw details in markdown format. */
  rawDetails?: string
}
