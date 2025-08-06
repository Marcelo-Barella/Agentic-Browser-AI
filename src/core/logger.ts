import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

/**
 * Log levels for the application
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4
} as const

/**
 * Log entry interface
 */
export interface LogEntry {
  timestamp: string
  level: typeof LogLevel[keyof typeof LogLevel]
  message: string
  module?: string | undefined
  operation?: string | undefined
  data?: any
  error?: Error | undefined
  sessionId?: string | undefined
  userId?: string | undefined
  requestId?: string | undefined
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: typeof LogLevel[keyof typeof LogLevel]
  enableConsole: boolean
  enableFile: boolean
  logDirectory: string
  maxFileSize: number
  maxFiles: number
}

/**
 * Centralized logging system for the agentic AI system
 * Provides file-based logging with date rotation and structured log entries
 */
export class Logger {
  private static instance: Logger
  private config: LoggerConfig
  private currentLogFile: string
  private isInitialized: boolean = false

  private constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      level: LogLevel.INFO,
      enableConsole: true,
      enableFile: true,
      logDirectory: 'logs',
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 30, // Keep 30 days of logs
      ...config
    }
    
    this.currentLogFile = this.getLogFileName()
    this.initialize()
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<LoggerConfig>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config)
    }
    return Logger.instance
  }

  /**
   * Initialize the logger
   */
  private initialize(): void {
    try {
      // Create logs directory if it doesn't exist
      if (!existsSync(this.config.logDirectory)) {
        mkdirSync(this.config.logDirectory, { recursive: true })
      }

      // Create initial log file
      this.ensureLogFile()
      this.isInitialized = true
      
      // Use console.log for initialization message to avoid circular dependency
      console.log(`[${new Date().toISOString()}] [INFO] [Logger.initialize] Logger initialized successfully`)
    } catch (error) {
      console.error('Failed to initialize logger:', error)
      throw new Error(`Logger initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get current date-based log filename
   */
  private getLogFileName(): string {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `log_${year}-${month}-${day}.log`
  }

  /**
   * Ensure log file exists and is current
   */
  private ensureLogFile(): void {
    const newLogFile = this.getLogFileName()
    
    if (newLogFile !== this.currentLogFile) {
      this.currentLogFile = newLogFile
    }

    const logFilePath = join(this.config.logDirectory, this.currentLogFile)
    
    // Create file if it doesn't exist
    if (!existsSync(logFilePath)) {
      writeFileSync(logFilePath, '', 'utf8')
    }
  }

  /**
   * Write log entry to file
   */
  private writeToFile(entry: LogEntry): void {
    try {
      this.ensureLogFile()
      const logFilePath = join(this.config.logDirectory, this.currentLogFile)
      
      const logLine = this.formatLogEntry(entry)
      appendFileSync(logFilePath, logLine + '\n', 'utf8')
    } catch (error) {
      console.error('Failed to write to log file:', error)
    }
  }

  /**
   * Format log entry for file output
   */
  private formatLogEntry(entry: LogEntry): string {
    const timestamp = entry.timestamp
    const level = this.getLevelName(entry.level)
    const message = entry.message
    const module = entry.module || 'unknown'
    const operation = entry.operation || 'unknown'
    
    let formatted = `[${timestamp}] [${level}] [${module}.${operation}] ${message}`
    
    if (entry.sessionId) {
      formatted += ` [session:${entry.sessionId}]`
    }
    
    if (entry.userId) {
      formatted += ` [user:${entry.userId}]`
    }
    
    if (entry.requestId) {
      formatted += ` [request:${entry.requestId}]`
    }
    
    if (entry.data) {
      formatted += ` [data:${JSON.stringify(entry.data)}]`
    }
    
    if (entry.error) {
      formatted += ` [error:${entry.error.message}] [stack:${entry.error.stack}]`
    }
    
    return formatted
  }

  private getLevelName(level: typeof LogLevel[keyof typeof LogLevel]): string {
    switch (level) {
      case LogLevel.DEBUG: return 'DEBUG'
      case LogLevel.INFO: return 'INFO'
      case LogLevel.WARN: return 'WARN'
      case LogLevel.ERROR: return 'ERROR'
      case LogLevel.CRITICAL: return 'CRITICAL'
      default: return 'UNKNOWN'
    }
  }

  /**
   * Write log entry to console
   */
  private writeToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp
    const level = this.getLevelName(entry.level)
    const message = entry.message
    const module = entry.module || 'unknown'
    const operation = entry.operation || 'unknown'
    
    const prefix = `[${timestamp}] [${level}] [${module}.${operation}]`
    
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(`${prefix} ${message}`)
        break
      case LogLevel.INFO:
        console.info(`${prefix} ${message}`)
        break
      case LogLevel.WARN:
        console.warn(`${prefix} ${message}`)
        break
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(`${prefix} ${message}`)
        break
    }
    
    if (entry.data) {
      console.log('Data:', JSON.stringify(entry.data, null, 2))
    }
    
    if (entry.error) {
      console.error('Error:', entry.error)
    }
  }

  /**
   * Create log entry
   */
  private createLogEntry(
    level: typeof LogLevel[keyof typeof LogLevel],
    message: string,
    options?: {
      module?: string
      operation?: string
      data?: any
      error?: Error | undefined
      sessionId?: string | undefined
      userId?: string | undefined
      requestId?: string | undefined
    }
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      module: options?.module || undefined,
      operation: options?.operation || undefined,
      data: options?.data,
      error: options?.error,
      sessionId: options?.sessionId || undefined,
      userId: options?.userId || undefined,
      requestId: options?.requestId || undefined
    }
  }

  /**
   * Log entry if level is enabled
   */
  private log(
    level: typeof LogLevel[keyof typeof LogLevel],
    message: string,
    options?: {
      module?: string
      operation?: string
      data?: any
      error?: Error | undefined
      sessionId?: string | undefined
      userId?: string | undefined
      requestId?: string | undefined
    }
  ): void {
    if (level < this.config.level) {
      return
    }

    const entry = this.createLogEntry(level, message, options)

    if (this.config.enableFile) {
      this.writeToFile(entry)
    }

    if (this.config.enableConsole) {
      this.writeToConsole(entry)
    }
  }

  /**
   * Log debug message
   */
  public debug(
    message: string,
    options?: {
      module?: string
      operation?: string
      data?: any
      sessionId?: string
      userId?: string
      requestId?: string
    }
  ): void {
    this.log(LogLevel.DEBUG, message, options)
  }

  /**
   * Log info message
   */
  public info(
    message: string,
    options?: {
      module?: string
      operation?: string
      data?: any
      sessionId?: string | undefined
      userId?: string | undefined
      requestId?: string | undefined
    }
  ): void {
    this.log(LogLevel.INFO, message, options)
  }

  /**
   * Log warning message
   */
  public warn(
    message: string,
    options?: {
      module?: string
      operation?: string
      data?: any
      error?: Error | undefined
      sessionId?: string | undefined
      userId?: string | undefined
      requestId?: string | undefined
    }
  ): void {
    this.log(LogLevel.WARN, message, options)
  }

  /**
   * Log error message
   */
  public error(
    message: string,
    options?: {
      module?: string
      operation?: string
      data?: any
      error?: Error | undefined
      sessionId?: string | undefined
      userId?: string | undefined
      requestId?: string | undefined
    }
  ): void {
    this.log(LogLevel.ERROR, message, options)
  }

  /**
   * Log critical message
   */
  public critical(
    message: string,
    options?: {
      module?: string
      operation?: string
      data?: any
      error?: Error | undefined
      sessionId?: string | undefined
      userId?: string | undefined
      requestId?: string | undefined
    }
  ): void {
    this.log(LogLevel.CRITICAL, message, options)
  }

  /**
   * Update logger configuration
   */
  public updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config }
    this.info('Logger configuration updated', {
      module: 'Logger',
      operation: 'updateConfig',
      data: config
    })
  }

  /**
   * Get current configuration
   */
  public getConfig(): LoggerConfig {
    return { ...this.config }
  }

  /**
   * Check if logger is initialized
   */
  public isReady(): boolean {
    return this.isInitialized
  }

  /**
   * Get current log file path
   */
  public getCurrentLogFile(): string {
    return join(this.config.logDirectory, this.currentLogFile)
  }

  /**
   * Clean up old log files
   */
  public async cleanupOldLogs(): Promise<void> {
    // Implementation for cleaning up old log files
    // This would remove log files older than maxFiles days
    this.info('Log cleanup completed', {
      module: 'Logger',
      operation: 'cleanupOldLogs'
    })
  }
}

/**
 * Convenience function to get logger instance
 */
export const getLogger = (): Logger => Logger.getInstance()

/**
 * Convenience functions for quick logging
 */
export const logDebug = (message: string, options?: any) => getLogger().debug(message, options)
export const logInfo = (message: string, options?: any) => getLogger().info(message, options)
export const logWarn = (message: string, options?: any) => getLogger().warn(message, options)
export const logError = (message: string, options?: any) => getLogger().error(message, options)
export const logCritical = (message: string, options?: any) => getLogger().critical(message, options) 