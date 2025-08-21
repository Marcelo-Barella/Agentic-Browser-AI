export interface ConsoleMessage {
  id: string
  level: 'log' | 'info' | 'warn' | 'error' | 'debug'
  message: string
  timestamp: Date
  source: 'console' | 'exception'
  url?: string
  lineNumber?: number
  columnNumber?: number
  stackTrace?: string
  sessionId: string
  metadata?: Record<string, any>
}

export interface ConsoleInspectionOptions {
  includeErrors?: boolean
  includeWarnings?: boolean
  includeInfo?: boolean
  includeLogs?: boolean
  includeDebug?: boolean
  maxLogs?: number
  captureStackTraces?: boolean
  captureSourceInfo?: boolean
}

export interface ConsoleExportOptions {
  format: 'json' | 'text' | 'csv'
  includeMetadata?: boolean
  includeStackTraces?: boolean
  includeSourceInfo?: boolean
  filterByLevel?: ('log' | 'info' | 'warn' | 'error' | 'debug')[]
  dateRange?: {
    start: Date
    end: Date
  }
}

export interface ConsoleInspectionSession {
  sessionId: string
  isActive: boolean
  startTime: Date
  endTime?: Date
  options: ConsoleInspectionOptions
  messageCount: number
  lastMessageTime?: Date
}

export interface ConsoleExportResult {
  format: string
  data: string
  messageCount: number
  exportTime: Date
  sessionId: string
}
