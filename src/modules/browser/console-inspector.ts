import { EventEmitter } from 'events'
import { getLogger } from '../../core/logger.js'
import { ErrorHandler } from '../../core/error-handler.js'
import {
  ConsoleMessage,
  ConsoleInspectionOptions,
  ConsoleExportOptions,
  ConsoleInspectionSession,
  ConsoleExportResult
} from './console-types.js'

export class ConsoleInspector extends EventEmitter {
  private activeInspections: Map<string, ConsoleInspectionSession> = new Map()
  private consoleLogs: Map<string, ConsoleMessage[]> = new Map()
  private logger = getLogger()
  private errorHandler: ErrorHandler
  private isInitialized = false

  constructor() {
    super()
    this.errorHandler = new ErrorHandler()
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      await this.errorHandler.initialize()
      this.isInitialized = true
      this.logger.info('Console Inspector initialized', {
        module: 'ConsoleInspector',
        operation: 'initialize'
      })
    } catch (error) {
      this.logger.error('Failed to initialize Console Inspector', {
        module: 'ConsoleInspector',
        operation: 'initialize',
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw error
    }
  }

  async startInspection(
    sessionId: string,
    options: ConsoleInspectionOptions = {}
  ): Promise<ConsoleInspectionSession> {
    try {
      if (this.activeInspections.has(sessionId)) {
        throw new Error(`Console inspection already active for session: ${sessionId}`)
      }

      const defaultOptions: ConsoleInspectionOptions = {
        includeErrors: true,
        includeWarnings: true,
        includeInfo: true,
        includeLogs: true,
        includeDebug: false,
        maxLogs: 1000,
        captureStackTraces: true,
        captureSourceInfo: true,
        ...options
      }

      const session: ConsoleInspectionSession = {
        sessionId,
        isActive: true,
        startTime: new Date(),
        options: defaultOptions,
        messageCount: 0
      }

      this.activeInspections.set(sessionId, session)
      this.consoleLogs.set(sessionId, [])

      this.logger.info('Console inspection started', {
        module: 'ConsoleInspector',
        operation: 'startInspection',
        data: { sessionId, options: defaultOptions }
      })

      this.emit('inspectionStarted', session)
      return session
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'ConsoleInspector',
          operation: 'startInspection',
          parameters: { sessionId, options }
        }
      )
      throw error
    }
  }

  async stopInspection(sessionId: string): Promise<ConsoleInspectionSession> {
    try {
      const session = this.activeInspections.get(sessionId)
      if (!session) {
        throw new Error(`No active console inspection found for session: ${sessionId}`)
      }

      session.isActive = false
      session.endTime = new Date()

      this.activeInspections.set(sessionId, session)

      this.logger.info('Console inspection stopped', {
        module: 'ConsoleInspector',
        operation: 'stopInspection',
        data: { sessionId, messageCount: session.messageCount }
      })

      this.emit('inspectionStopped', session)
      return session
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'ConsoleInspector',
          operation: 'stopInspection',
          parameters: { sessionId }
        }
      )
      throw error
    }
  }

  async addConsoleMessage(sessionId: string, message: Omit<ConsoleMessage, 'id' | 'timestamp'>): Promise<void> {
    try {
      const session = this.activeInspections.get(sessionId)
      if (!session || !session.isActive) {
        return
      }

      const logs = this.consoleLogs.get(sessionId) || []
      const newMessage: ConsoleMessage = {
        ...message,
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date()
      }

      // Check if we should capture this message based on options
      if (!this.shouldCaptureMessage(newMessage, session.options)) {
        return
      }

      logs.push(newMessage)
      session.messageCount++
      session.lastMessageTime = new Date()

      // Implement log rotation if maxLogs is exceeded
      if (session.options.maxLogs && logs.length > session.options.maxLogs) {
        logs.splice(0, logs.length - session.options.maxLogs)
      }

      this.consoleLogs.set(sessionId, logs)
      this.activeInspections.set(sessionId, session)

      this.emit('messageCaptured', newMessage)
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'ConsoleInspector',
          operation: 'addConsoleMessage',
          parameters: { sessionId, message }
        }
      )
    }
  }

  async getConsoleLogs(
    sessionId: string,
    options: {
      level?: 'log' | 'info' | 'warn' | 'error' | 'debug'
      limit?: number
      clearAfter?: boolean
    } = {}
  ): Promise<ConsoleMessage[]> {
    try {
      const logs = this.consoleLogs.get(sessionId) || []
      let filteredLogs = [...logs]

      // Filter by level if specified
      if (options.level) {
        filteredLogs = filteredLogs.filter(log => log.level === options.level)
      }

      // Apply limit if specified
      if (options.limit) {
        filteredLogs = filteredLogs.slice(-options.limit)
      }

      // Clear logs after retrieval if requested
      if (options.clearAfter) {
        this.consoleLogs.set(sessionId, [])
        const session = this.activeInspections.get(sessionId)
        if (session) {
          session.messageCount = 0
          this.activeInspections.set(sessionId, session)
        }
      }

      this.logger.debug('Console logs retrieved', {
        module: 'ConsoleInspector',
        operation: 'getConsoleLogs',
        data: { sessionId, count: filteredLogs.length, options }
      })

      return filteredLogs
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'ConsoleInspector',
          operation: 'getConsoleLogs',
          parameters: { sessionId, options }
        }
      )
      throw error
    }
  }

  async clearConsoleLogs(sessionId: string): Promise<void> {
    try {
      this.consoleLogs.set(sessionId, [])
      const session = this.activeInspections.get(sessionId)
      if (session) {
        session.messageCount = 0
        this.activeInspections.set(sessionId, session)
      }

      this.logger.info('Console logs cleared', {
        module: 'ConsoleInspector',
        operation: 'clearConsoleLogs',
        data: { sessionId }
      })

      this.emit('logsCleared', sessionId)
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'ConsoleInspector',
          operation: 'clearConsoleLogs',
          parameters: { sessionId }
        }
      )
      throw error
    }
  }

  async exportConsoleLogs(
    sessionId: string,
    options: ConsoleExportOptions
  ): Promise<ConsoleExportResult> {
    try {
      const logs = this.consoleLogs.get(sessionId) || []
      let filteredLogs = [...logs]

      // Apply level filter
      if (options.filterByLevel && options.filterByLevel.length > 0) {
        filteredLogs = filteredLogs.filter(log => options.filterByLevel!.includes(log.level))
      }

      // Apply date range filter
      if (options.dateRange) {
        filteredLogs = filteredLogs.filter(log => 
          log.timestamp >= options.dateRange!.start && log.timestamp <= options.dateRange!.end
        )
      }

      let exportData = ''
      let messageCount = filteredLogs.length

      switch (options.format) {
        case 'json':
          const jsonData = filteredLogs.map(log => {
            const exportLog: any = {
              level: log.level,
              message: log.message,
              timestamp: log.timestamp.toISOString(),
              source: log.source,
              sessionId: log.sessionId
            }

            if (options.includeSourceInfo) {
              if (log.url) exportLog.url = log.url
              if (log.lineNumber) exportLog.lineNumber = log.lineNumber
              if (log.columnNumber) exportLog.columnNumber = log.columnNumber
            }

            if (options.includeStackTraces && log.stackTrace) {
              exportLog.stackTrace = log.stackTrace
            }

            if (options.includeMetadata && log.metadata) {
              exportLog.metadata = log.metadata
            }

            return exportLog
          })
          exportData = JSON.stringify(jsonData, null, 2)
          break

        case 'text':
          exportData = filteredLogs.map(log => {
            let line = `[${log.timestamp.toISOString()}] ${log.level.toUpperCase()}: ${log.message}`
            
            if (options.includeSourceInfo && log.url) {
              line += ` (${log.url}${log.lineNumber ? `:${log.lineNumber}` : ''})`
            }

            if (options.includeStackTraces && log.stackTrace) {
              line += `\nStack Trace:\n${log.stackTrace}`
            }

            return line
          }).join('\n')
          break

        case 'csv':
          const headers = ['timestamp', 'level', 'message', 'source', 'sessionId']
          if (options.includeSourceInfo) {
            headers.push('url', 'lineNumber', 'columnNumber')
          }
          if (options.includeStackTraces) {
            headers.push('stackTrace')
          }
          if (options.includeMetadata) {
            headers.push('metadata')
          }

          const csvRows = [headers.join(',')]
          
          filteredLogs.forEach(log => {
            const row = [
              log.timestamp.toISOString(),
              log.level,
              `"${log.message.replace(/"/g, '""')}"`,
              log.source,
              log.sessionId
            ]

            if (options.includeSourceInfo) {
              row.push(
                log.url || '',
                log.lineNumber?.toString() || '',
                log.columnNumber?.toString() || ''
              )
            }

            if (options.includeStackTraces) {
              row.push(`"${(log.stackTrace || '').replace(/"/g, '""')}"`)
            }

            if (options.includeMetadata) {
              row.push(`"${JSON.stringify(log.metadata || {}).replace(/"/g, '""')}"`)
            }

            csvRows.push(row.join(','))
          })

          exportData = csvRows.join('\n')
          break

        default:
          throw new Error(`Unsupported export format: ${options.format}`)
      }

      const result: ConsoleExportResult = {
        format: options.format,
        data: exportData,
        messageCount,
        exportTime: new Date(),
        sessionId
      }

      this.logger.info('Console logs exported', {
        module: 'ConsoleInspector',
        operation: 'exportConsoleLogs',
        data: { sessionId, format: options.format, messageCount }
      })

      this.emit('logsExported', result)
      return result
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'ConsoleInspector',
          operation: 'exportConsoleLogs',
          parameters: { sessionId, options }
        }
      )
      throw error
    }
  }

  async getInspectionStatus(sessionId: string): Promise<ConsoleInspectionSession | null> {
    return this.activeInspections.get(sessionId) || null
  }

  async getAllActiveInspections(): Promise<ConsoleInspectionSession[]> {
    return Array.from(this.activeInspections.values())
  }

  async cleanupSession(sessionId: string): Promise<void> {
    try {
      await this.stopInspection(sessionId)
      this.consoleLogs.delete(sessionId)
      this.activeInspections.delete(sessionId)

      this.logger.info('Console inspection session cleaned up', {
        module: 'ConsoleInspector',
        operation: 'cleanupSession',
        data: { sessionId }
      })
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'ConsoleInspector',
          operation: 'cleanupSession',
          parameters: { sessionId }
        }
      )
    }
  }

  private shouldCaptureMessage(message: ConsoleMessage, options: ConsoleInspectionOptions): boolean {
    switch (message.level) {
      case 'error':
        return options.includeErrors !== false
      case 'warn':
        return options.includeWarnings !== false
      case 'info':
        return options.includeInfo !== false
      case 'log':
        return options.includeLogs !== false
      case 'debug':
        return options.includeDebug !== false
      default:
        return true
    }
  }

  async shutdown(): Promise<void> {
    try {
      // Stop all active inspections
      for (const sessionId of this.activeInspections.keys()) {
        await this.stopInspection(sessionId)
      }

      // Clear all logs
      this.consoleLogs.clear()
      this.activeInspections.clear()

      this.logger.info('Console Inspector shutdown complete', {
        module: 'ConsoleInspector',
        operation: 'shutdown'
      })
    } catch (error) {
      this.logger.error('Error during Console Inspector shutdown', {
        module: 'ConsoleInspector',
        operation: 'shutdown',
        error: error instanceof Error ? error : new Error(String(error))
      })
    }
  }
}
