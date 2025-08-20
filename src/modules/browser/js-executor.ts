import { EventEmitter } from 'events'
import { getLogger } from '../../core/logger.js'
import { ErrorHandler } from '../../core/error-handler.js'
import { CDPConnectionManager } from './cdp-connection-manager.js'

export interface ScriptExecutionOptions {
  timeout?: number
  sandbox?: boolean
  context?: Record<string, any>
  returnByValue?: boolean
  awaitPromise?: boolean
  userGesture?: boolean
}

export interface ScriptResult {
  success: boolean
  result?: any
  error?: string
  executionTime: number
  memoryUsage?: number
  timestamp: Date
}

export interface ScriptValidation {
  isValid: boolean
  reason?: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  warnings: string[]
}

export interface PerformanceMetrics {
  executionTime: number
  memoryUsage: number
  cpuUsage: number
  scriptSize: number
}

export class JavaScriptExecutor extends EventEmitter {
  private cdpManager: CDPConnectionManager
  private logger: any
  private errorHandler: ErrorHandler
  private isInitialized: boolean = false
  private executionHistory: ScriptResult[] = []
  private maxHistorySize: number = 1000

  constructor(cdpManager: CDPConnectionManager) {
    super()
    this.cdpManager = cdpManager
    this.logger = getLogger()
    this.errorHandler = new ErrorHandler()
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      await this.errorHandler.initialize()
      this.isInitialized = true
      this.emit('initialized')
      
      this.logger.info('JavaScript Executor initialized successfully', {
        module: 'JavaScriptExecutor',
        operation: 'initialize'
      })
    } catch (error) {
      this.logger.error('Failed to initialize JavaScript Executor', {
        module: 'JavaScriptExecutor',
        operation: 'initialize',
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`JavaScript Executor initialization failed: ${error}`)
    }
  }

  async executeScript(sessionId: string, script: string, options: ScriptExecutionOptions = {}): Promise<ScriptResult> {
    if (!this.isInitialized) {
      throw new Error('JavaScript Executor not initialized')
    }

    try {
      // Validate session state first
      const isSessionValid = await this.validateSessionState(sessionId)
      if (!isSessionValid) {
        throw new Error('Session state is invalid or connection is unhealthy')
      }

      const validation = await this.validateScript(script)
      if (!validation.isValid) {
        throw new Error(`Script validation failed: ${validation.reason}`)
      }

      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      // Validate CDP Runtime domain is enabled
      if (!connection.enabledDomains.has('Runtime')) {
        throw new Error('CDP Runtime domain is not enabled for this session')
      }

      const startTime = Date.now()
      const executionOptions: any = {
        returnByValue: options.returnByValue !== false,
        awaitPromise: options.awaitPromise !== false,
        userGesture: options.userGesture || false
      }

      if (options.context) {
        executionOptions.contextId = await this.createExecutionContext(sessionId, options.context)
      }

      // Add timeout handling
      const timeout = options.timeout || 30000 // Default 30 second timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Script execution timed out after ${timeout}ms`))
        }, timeout)
      })

      // Execute script with timeout
      const executionPromise = connection.page.evaluate(script, executionOptions)
      const result = await Promise.race([executionPromise, timeoutPromise])
      
      const executionTime = Date.now() - startTime

      const scriptResult: ScriptResult = {
        success: true,
        result,
        executionTime,
        timestamp: new Date()
      }

      this.addToHistory(scriptResult)
      
      this.logger.info('Script executed successfully', {
        module: 'JavaScriptExecutor',
        operation: 'executeScript',
        data: {
          sessionId,
          scriptLength: script.length,
          executionTime,
          resultType: typeof result,
          timeout
        }
      })

      this.emit('scriptExecuted', sessionId, scriptResult)
      return scriptResult
    } catch (error) {
      const scriptResult: ScriptResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: 0,
        timestamp: new Date()
      }

      this.addToHistory(scriptResult)
      
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'JavaScriptExecutor',
          operation: 'executeScript',
          sessionId,
          parameters: { script: script.substring(0, 100), options }
        },
        'medium'
      )
      throw error
    }
  }

  async executeFunction(sessionId: string, functionBody: string, args: any[] = [], options: ScriptExecutionOptions = {}): Promise<ScriptResult> {
    const script = `(${functionBody})(${args.map(arg => JSON.stringify(arg)).join(', ')})`
    return await this.executeScript(sessionId, script, options)
  }

  async injectScript(sessionId: string, script: string, options: ScriptExecutionOptions = {}): Promise<ScriptResult> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      const startTime = Date.now()
      
      const result = await connection.page.addScriptTag({
        content: script,
        type: 'text/javascript'
      })
      
      const executionTime = Date.now() - startTime

      const scriptResult: ScriptResult = {
        success: true,
        result: result,
        executionTime,
        timestamp: new Date()
      }

      this.addToHistory(scriptResult)
      
      this.logger.info('Script injected successfully', {
        module: 'JavaScriptExecutor',
        operation: 'injectScript',
        data: {
          sessionId,
          scriptLength: script.length,
          executionTime
        }
      })

      this.emit('scriptInjected', sessionId, scriptResult)
      return scriptResult
    } catch (error) {
      const scriptResult: ScriptResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: 0,
        timestamp: new Date()
      }

      this.addToHistory(scriptResult)
      
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'JavaScriptExecutor',
          operation: 'injectScript',
          sessionId,
          parameters: { script: script.substring(0, 100), options }
        },
        'medium'
      )
      throw error
    }
  }

  async executeAsyncScript(sessionId: string, script: string, options: ScriptExecutionOptions = {}): Promise<ScriptResult> {
    const asyncScript = `
      (async () => {
        ${script}
      })()
    `
    
    return await this.executeScript(sessionId, asyncScript, {
      ...options,
      awaitPromise: true
    })
  }

  async validateScript(script: string): Promise<ScriptValidation> {
    const validation: ScriptValidation = {
      isValid: true,
      riskLevel: 'low',
      warnings: []
    }

    const dangerousPatterns = [
      {
        pattern: /eval\s*\(/gi,
        reason: 'eval() function is dangerous',
        riskLevel: 'critical' as const
      },
      {
        pattern: /Function\s*\(/gi,
        reason: 'Function constructor is dangerous',
        riskLevel: 'critical' as const
      },
      {
        pattern: /setTimeout\s*\(/gi,
        reason: 'setTimeout() may be used maliciously',
        riskLevel: 'medium' as const
      },
      {
        pattern: /setInterval\s*\(/gi,
        reason: 'setInterval() may be used maliciously',
        riskLevel: 'medium' as const
      },
      {
        pattern: /document\.write/gi,
        reason: 'document.write() can cause XSS',
        riskLevel: 'high' as const
      },
      {
        pattern: /innerHTML\s*=/gi,
        reason: 'innerHTML can cause XSS',
        riskLevel: 'high' as const
      },
      {
        pattern: /outerHTML\s*=/gi,
        reason: 'outerHTML can cause XSS',
        riskLevel: 'high' as const
      },
      {
        pattern: /fetch\s*\(/gi,
        reason: 'fetch() may make unauthorized requests',
        riskLevel: 'medium' as const
      },
      {
        pattern: /XMLHttpRequest/gi,
        reason: 'XMLHttpRequest may make unauthorized requests',
        riskLevel: 'medium' as const
      },
      {
        pattern: /localStorage/gi,
        reason: 'localStorage access may be sensitive',
        riskLevel: 'low' as const
      },
      {
        pattern: /sessionStorage/gi,
        reason: 'sessionStorage access may be sensitive',
        riskLevel: 'low' as const
      }
    ]

    for (const { pattern, reason, riskLevel } of dangerousPatterns) {
      if (pattern.test(script)) {
        validation.warnings.push(reason)
        if (riskLevel === 'critical') {
          validation.isValid = false
          validation.reason = reason
          validation.riskLevel = riskLevel
          break
        } else if (riskLevel === 'high' && validation.riskLevel === 'low') {
          validation.riskLevel = 'high'
        } else if (riskLevel === 'medium' && validation.riskLevel === 'low') {
          validation.riskLevel = 'medium'
        }
      }
    }

    if (script.length > 10000) {
      validation.warnings.push('Script is very large')
      validation.riskLevel = 'medium'
    }

    return validation
  }

  async getPerformanceMetrics(sessionId: string): Promise<PerformanceMetrics> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      const metrics = await connection.page.metrics()
      
      return {
        executionTime: metrics.ScriptDuration || 0,
        memoryUsage: metrics.JSHeapUsedSize || 0,
        cpuUsage: 0, // CPUTime not available in Puppeteer metrics
        scriptSize: 0
      }
    } catch (error) {
      this.logger.warn('Failed to get performance metrics', {
        module: 'JavaScriptExecutor',
        operation: 'getPerformanceMetrics',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId }
      })
      
      return {
        executionTime: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        scriptSize: 0
      }
    }
  }

  async createExecutionContext(sessionId: string, context: Record<string, any>): Promise<string> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      const contextId = `context_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      await connection.page.evaluate((contextData) => {
        for (const [key, value] of Object.entries(contextData)) {
          (globalThis as any)[key] = value
        }
      }, context)

      this.logger.debug('Execution context created', {
        module: 'JavaScriptExecutor',
        operation: 'createExecutionContext',
        data: { sessionId, contextId, contextKeys: Object.keys(context) }
      })

      return contextId
    } catch (error) {
      this.logger.error('Failed to create execution context', {
        module: 'JavaScriptExecutor',
        operation: 'createExecutionContext',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId }
      })
      throw error
    }
  }

  async cleanupExecutionContext(sessionId: string, contextId: string): Promise<void> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        return
      }

      await connection.page.evaluate((contextId) => {
        delete (globalThis as any)[contextId]
      }, contextId)

      this.logger.debug('Execution context cleaned up', {
        module: 'JavaScriptExecutor',
        operation: 'cleanupExecutionContext',
        data: { sessionId, contextId }
      })
    } catch (error) {
      this.logger.warn('Failed to cleanup execution context', {
        module: 'JavaScriptExecutor',
        operation: 'cleanupExecutionContext',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, contextId }
      })
    }
  }

  getExecutionHistory(): ScriptResult[] {
    return [...this.executionHistory]
  }

  getExecutionStats(): {
    totalExecutions: number
    successfulExecutions: number
    failedExecutions: number
    averageExecutionTime: number
    totalExecutionTime: number
  } {
    const totalExecutions = this.executionHistory.length
    const successfulExecutions = this.executionHistory.filter(r => r.success).length
    const failedExecutions = totalExecutions - successfulExecutions
    const totalExecutionTime = this.executionHistory.reduce((sum, r) => sum + r.executionTime, 0)
    const averageExecutionTime = totalExecutions > 0 ? totalExecutionTime / totalExecutions : 0

    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      averageExecutionTime,
      totalExecutionTime
    }
  }

  clearHistory(): void {
    this.executionHistory = []
    
    this.logger.info('Execution history cleared', {
      module: 'JavaScriptExecutor',
      operation: 'clearHistory'
    })
  }

  private addToHistory(result: ScriptResult): void {
    this.executionHistory.push(result)
    
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(-this.maxHistorySize)
    }
  }

  isReady(): boolean {
    return this.isInitialized
  }

  async shutdown(): Promise<void> {
    this.executionHistory = []
    this.isInitialized = false
    this.emit('shutdown')
  }

  private async validateSessionState(sessionId: string): Promise<boolean> {
    try {
      // Check if connection is healthy
      const isConnectionValid = await this.cdpManager.validateConnection(sessionId)
      if (!isConnectionValid) {
        this.logger.warn('Session validation failed - connection is unhealthy', {
          module: 'JavaScriptExecutor',
          operation: 'validateSessionState',
          sessionId
        })
        return false
      }

      // Additional session state validation
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection || !connection.isActive) {
        this.logger.warn('Session validation failed - connection is inactive', {
          module: 'JavaScriptExecutor',
          operation: 'validateSessionState',
          sessionId
        })
        return false
      }

      // Check if page is accessible
      if (connection.page.isClosed()) {
        this.logger.warn('Session validation failed - page is closed', {
          module: 'JavaScriptExecutor',
          operation: 'validateSessionState',
          sessionId
        })
        return false
      }

      return true
    } catch (error) {
      this.logger.error('Session validation error', {
        module: 'JavaScriptExecutor',
        operation: 'validateSessionState',
        sessionId,
        error: error instanceof Error ? error : new Error(String(error))
      })
      return false
    }
  }
}
