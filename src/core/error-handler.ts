import { EventEmitter } from 'events'
import { getLogger } from './logger.js'

/**
 * Error Handling Framework
 * Provides comprehensive error handling, logging, and recovery mechanisms
 * for the agentic AI system
 */

export interface ErrorInfo {
  id: string
  timestamp: Date
  type: ErrorType
  message: string
  stack?: string
  context: ErrorContext
  severity: ErrorSeverity
  recoverable: boolean
  handled: boolean
  retryCount: number
  maxRetries: number
}

export interface ErrorContext {
  module: string
  operation: string
  parameters?: Record<string, any>
  sessionId?: string
  userId?: string
  requestId?: string
}

export type ErrorType = 
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'filesystem'
  | 'network'
  | 'database'
  | 'timeout'
  | 'resource'
  | 'configuration'
  | 'unknown'

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface ErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: any
    timestamp: Date
    requestId?: string
  }
}

export interface RecoveryAction {
  type: 'retry' | 'fallback' | 'rollback' | 'notify' | 'ignore'
  description: string
  parameters?: Record<string, any>
  priority: number
}

export class ErrorHandler extends EventEmitter {
  private errors: ErrorInfo[] = []
  private recoveryStrategies: Map<ErrorType, RecoveryAction[]> = new Map()
  private maxErrors = 50
  private isInitialized = false

  constructor() {
    super()
    this.initializeRecoveryStrategies()
    
    // Prevent unhandled error events
    this.on('error', () => {
      // Silently handle error events to prevent unhandled errors
    })
  }

  /**
   * Initialize the error handler
   */
  async initialize(): Promise<void> {
    try {
      this.isInitialized = true
      this.emit('initialized')
      getLogger().info('Error Handler initialized successfully', {
        module: 'ErrorHandler',
        operation: 'initialize'
      })
    } catch (error) {
      getLogger().error('Failed to initialize Error Handler', {
        module: 'ErrorHandler',
        operation: 'initialize',
        error: error instanceof Error ? error : new Error(String(error))
      })
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Error Handler initialization failed: ${errorMessage}`)
    }
  }

  /**
   * Handle an error with appropriate logging and recovery
   */
  async handleError(
    error: Error,
    context: ErrorContext,
    severity: ErrorSeverity = 'medium'
  ): Promise<ErrorResponse> {
    try {
      const errorInfo = this.createErrorInfo(error, context, severity)
      
      // Log the error
      this.logError(errorInfo)
      
      // Emit error event
      this.emit('error', errorInfo)
      
      // Attempt recovery
      const recoveryResult = await this.attemptRecovery(errorInfo)
      
      // Create error response
      const response: ErrorResponse = {
        success: false,
        error: {
          code: this.generateErrorCode(errorInfo),
          message: errorInfo.message,
          details: {
            type: errorInfo.type,
            severity: errorInfo.severity,
            recoverable: errorInfo.recoverable,
            recoveryAttempted: recoveryResult.attempted
          },
          timestamp: errorInfo.timestamp,
          ...(context.requestId && { requestId: context.requestId })
        }
      }

      return response
    } catch (handlingError) {
      console.error('Error in error handler:', handlingError)
      return this.createFallbackErrorResponse(error, context)
    }
  }

  /**
   * Create error information object
   */
  private createErrorInfo(
    error: Error,
    context: ErrorContext,
    severity: ErrorSeverity
  ): ErrorInfo {
    const errorType = this.determineErrorType(error, context)
    const recoverable = this.isRecoverable(errorType, severity)
    
    return {
      id: this.generateErrorId(),
      timestamp: new Date(),
      type: errorType,
      message: error.message,
      ...(error.stack && { stack: error.stack }),
      context,
      severity,
      recoverable,
      handled: false,
      retryCount: 0,
      maxRetries: this.getMaxRetries(errorType)
    }
  }

  /**
   * Determine error type based on error and context
   */
  private determineErrorType(error: Error, context: ErrorContext): ErrorType {
    const message = error.message.toLowerCase()
    
    // Check for authentication errors first
    if (message.includes('invalid credentials') || message.includes('unauthorized') || message.includes('auth')) {
      return 'authentication'
    }
    
    // Check for authorization errors
    if (message.includes('permission') || message.includes('forbidden') || message.includes('insufficient')) {
      return 'authorization'
    }
    
    // Check for network errors first (before timeout)
    if (message.includes('connection timeout') || message.includes('network') || message.includes('connection')) {
      return 'network'
    }
    
    // Check for timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout'
    }
    
    // Check for configuration errors
    if (message.includes('configuration') || message.includes('config')) {
      return 'configuration'
    }
    
    // Check for filesystem errors
    if (message.includes('file') || message.includes('fs') || message.includes('path')) {
      return 'filesystem'
    }
    
    // Check for database errors
    if (message.includes('database') || message.includes('db')) {
      return 'database'
    }
    
    // Check for resource errors
    if (message.includes('memory') || message.includes('resource')) {
      return 'resource'
    }
    
    // Check for validation errors last (most generic)
    if (message.includes('validation') || message.includes('invalid')) {
      return 'validation'
    }
    
    return 'unknown'
  }

  /**
   * Check if error is recoverable
   */
  private isRecoverable(errorType: ErrorType, severity: ErrorSeverity): boolean {
    // Critical errors are generally not recoverable
    if (severity === 'critical') {
      return false
    }
    
    // Some error types are more recoverable than others
    const recoverableTypes: ErrorType[] = ['timeout', 'network', 'resource']
    return recoverableTypes.includes(errorType)
  }

  /**
   * Get maximum retry count for error type
   */
  private getMaxRetries(errorType: ErrorType): number {
    const retryMap: Record<ErrorType, number> = {
      timeout: 3,
      network: 5,
      resource: 2,
      filesystem: 1,
      database: 2,
      validation: 0,
      authentication: 1,
      authorization: 0,
      configuration: 0,
      unknown: 1
    }
    
    return retryMap[errorType] || 0
  }

  /**
   * Log error information
   */
  private logError(errorInfo: ErrorInfo): void {
    // Add to error log
    this.errors.push(errorInfo)
    
    // Keep log size manageable
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors)
    }
    
    // Log using the new logging system
    const logger = getLogger()
    const logOptions = {
      module: errorInfo.context.module,
      operation: errorInfo.context.operation,
      data: {
        errorId: errorInfo.id,
        errorType: errorInfo.type,
        severity: errorInfo.severity,
        recoverable: errorInfo.recoverable,
        retryCount: errorInfo.retryCount,
        maxRetries: errorInfo.maxRetries,
        sessionId: errorInfo.context.sessionId,
        userId: errorInfo.context.userId,
        requestId: errorInfo.context.requestId
      },
      error: errorInfo.stack ? new Error(errorInfo.stack) : undefined,
      sessionId: errorInfo.context.sessionId || undefined,
      userId: errorInfo.context.userId || undefined,
      requestId: errorInfo.context.requestId || undefined
    }
    
    switch (errorInfo.severity) {
      case 'critical':
        logger.critical(`[${errorInfo.type}] ${errorInfo.message}`, logOptions)
        break
      case 'high':
        logger.error(`[${errorInfo.type}] ${errorInfo.message}`, logOptions)
        break
      case 'medium':
        logger.warn(`[${errorInfo.type}] ${errorInfo.message}`, logOptions)
        break
      case 'low':
        logger.info(`[${errorInfo.type}] ${errorInfo.message}`, logOptions)
        break
    }
  }

  /**
   * Attempt error recovery
   */
  private async attemptRecovery(errorInfo: ErrorInfo): Promise<{ attempted: boolean; success: boolean }> {
    if (!errorInfo.recoverable || errorInfo.retryCount >= errorInfo.maxRetries) {
      return { attempted: false, success: false }
    }

    const strategies = this.recoveryStrategies.get(errorInfo.type) || []
    
    for (const strategy of strategies.sort((a, b) => b.priority - a.priority)) {
      try {
        await this.executeRecoveryStrategy(strategy, errorInfo)
        return { attempted: true, success: true }
      } catch (recoveryError) {
        console.warn(`Recovery strategy failed: ${strategy.description}`, recoveryError)
        continue
      }
    }
    
    return { attempted: true, success: false }
  }

  /**
   * Execute recovery strategy
   */
  private async executeRecoveryStrategy(strategy: RecoveryAction, errorInfo: ErrorInfo): Promise<void> {
    switch (strategy.type) {
      case 'retry':
        await this.performRetry(errorInfo)
        break
      case 'fallback':
        await this.performFallback(strategy, errorInfo)
        break
      case 'rollback':
        await this.performRollback(strategy, errorInfo)
        break
      case 'notify':
        await this.performNotification(strategy, errorInfo)
        break
      case 'ignore':
        // Do nothing, just log
        console.log(`Ignoring error: ${errorInfo.message}`)
        break
    }
  }

  /**
   * Perform retry operation
   */
  private async performRetry(errorInfo: ErrorInfo): Promise<void> {
    errorInfo.retryCount++
    console.log(`Retrying operation (${errorInfo.retryCount}/${errorInfo.maxRetries}): ${errorInfo.context.operation}`)
    
    // Wait before retry (exponential backoff)
    const delay = Math.min(1000 * Math.pow(2, errorInfo.retryCount - 1), 10000)
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  /**
   * Perform fallback operation
   */
  private async performFallback(strategy: RecoveryAction, errorInfo: ErrorInfo): Promise<void> {
    console.log(`Performing fallback: ${strategy.description}`)
    this.emit('fallback', { strategy, errorInfo })
  }

  /**
   * Perform rollback operation
   */
  private async performRollback(strategy: RecoveryAction, errorInfo: ErrorInfo): Promise<void> {
    console.log(`Performing rollback: ${strategy.description}`)
    this.emit('rollback', { strategy, errorInfo })
  }

  /**
   * Perform notification
   */
  private async performNotification(strategy: RecoveryAction, errorInfo: ErrorInfo): Promise<void> {
    console.log(`Sending notification: ${strategy.description}`)
    this.emit('notify', { strategy, errorInfo })
  }

  /**
   * Initialize recovery strategies
   */
  private initializeRecoveryStrategies(): void {
    // Timeout errors - retry with backoff
    this.recoveryStrategies.set('timeout', [
      { type: 'retry', description: 'Retry with exponential backoff', priority: 10 }
    ])

    // Network errors - retry with backoff
    this.recoveryStrategies.set('network', [
      { type: 'retry', description: 'Retry network operation', priority: 10 },
      { type: 'fallback', description: 'Use cached data', priority: 5 }
    ])

    // Resource errors - retry with delay
    this.recoveryStrategies.set('resource', [
      { type: 'retry', description: 'Retry with delay', priority: 8 },
      { type: 'fallback', description: 'Use alternative resource', priority: 6 }
    ])

    // Filesystem errors - limited retry
    this.recoveryStrategies.set('filesystem', [
      { type: 'retry', description: 'Retry file operation', priority: 5 },
      { type: 'fallback', description: 'Use backup file', priority: 3 }
    ])

    // Database errors - retry with connection reset
    this.recoveryStrategies.set('database', [
      { type: 'retry', description: 'Retry database operation', priority: 8 },
      { type: 'fallback', description: 'Use read replica', priority: 5 }
    ])

    // Authentication errors - notify and retry once
    this.recoveryStrategies.set('authentication', [
      { type: 'notify', description: 'Notify authentication failure', priority: 10 },
      { type: 'retry', description: 'Retry with fresh token', priority: 5 }
    ])
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${process.hrtime.bigint()}`
  }

  /**
   * Generate error code
   */
  private generateErrorCode(errorInfo: ErrorInfo): string {
    const severityCode = {
      'low': 'L',
      'medium': 'M',
      'high': 'H',
      'critical': 'C'
    }[errorInfo.severity]
    
    const typeCode = errorInfo.type.toUpperCase().substr(0, 3)
    
    return `${severityCode}${typeCode}_${errorInfo.id.split('_')[1]}`
  }

  /**
   * Create fallback error response
   */
  private createFallbackErrorResponse(error: Error, context: ErrorContext): ErrorResponse {
    return {
      success: false,
      error: {
        code: 'ERR_HANDLER_FAILED',
        message: 'Error handler failed to process error',
        details: {
          originalError: error.message,
          context
        },
        timestamp: new Date(),
        ...(context.requestId && { requestId: context.requestId })
      }
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number
    byType: Record<ErrorType, number>
    bySeverity: Record<ErrorSeverity, number>
    recentErrors: ErrorInfo[]
  } {
    const byType: Record<ErrorType, number> = {
      validation: 0,
      authentication: 0,
      authorization: 0,
      filesystem: 0,
      network: 0,
      database: 0,
      timeout: 0,
      resource: 0,
      configuration: 0,
      unknown: 0
    }
    const bySeverity: Record<ErrorSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    }
    
    for (const error of this.errors) {
      byType[error.type] = (byType[error.type] || 0) + 1
      bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1
    }
    
    return {
      total: this.errors.length,
      byType,
      bySeverity,
      recentErrors: this.errors.slice(-10)
    }
  }

  /**
   * Clear error log
   */
  clearErrorLog(): void {
    this.errors = []
    // Force garbage collection if available
    if (global.gc) {
      global.gc()
    }
  }

  /**
   * Add custom recovery strategy
   */
  addRecoveryStrategy(errorType: ErrorType, strategy: RecoveryAction): void {
    const strategies = this.recoveryStrategies.get(errorType) || []
    strategies.push(strategy)
    this.recoveryStrategies.set(errorType, strategies)
  }

  /**
   * Get recovery strategies for error type
   */
  getRecoveryStrategies(errorType: ErrorType): RecoveryAction[] {
    return this.recoveryStrategies.get(errorType) || []
  }

  /**
   * Check if error handler is initialized
   */
  isReady(): boolean {
    return this.isInitialized
  }
} 