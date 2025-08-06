/**
 * Task Executor - Phase 3 Component
 * Executes planned tasks with comprehensive error handling and monitoring
 * Integrates with existing BrowserManager, ProjectAnalyzer, and FileSystemManager
 */

import { EventEmitter } from 'events'
import { ExecutionPlan, ExecutionStep, TaskContext } from './task-planner'
import { BrowserManager } from '../browser/browser-manager'
import { ProjectAnalyzer } from '../project-analyzer'
import { FileSystemManager } from '../filesystem-manager'
import { ErrorHandler } from '../../core/error-handler'

export interface TaskExecutionResult {
  taskId: string
  stepId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  startTime: Date
  endTime?: Date
  duration?: number
  result?: any
  error?: {
    message: string
    code: string
    details?: any
  }
  logs: string[]
  metadata: Record<string, any>
}

export interface TaskExecution {
  id: string
  planId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  currentStep: number
  totalSteps: number
  startTime: Date
  endTime?: Date
  duration?: number
  results: TaskExecutionResult[]
  progress: number
  logs: string[]
  metadata: Record<string, any>
}

export interface ExecutionContext {
  taskId: string
  stepId: string
  parameters: Record<string, any>
  validationRules: Record<string, any>
  context: TaskContext
}

export class TaskExecutor extends EventEmitter {
  private browserManager: BrowserManager
  private fileSystemManager: FileSystemManager
  private errorHandler: ErrorHandler
  private activeExecutions: Map<string, TaskExecution> = new Map()
  private isInitialized = false

  constructor() {
    super()
    this.browserManager = new BrowserManager()
    this.fileSystemManager = new FileSystemManager()
    this.errorHandler = new ErrorHandler()
  }

  /**
   * Initialize the task executor
   */
  async initialize(): Promise<void> {
    try {
      await this.errorHandler.initialize()
      await this.browserManager.initialize()
      this.isInitialized = true
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'TaskExecutor',
          operation: 'initialize'
        },
        'critical'
      )
      throw error
    }
  }

  /**
   * Execute a complete execution plan
   */
  async executePlan(plan: ExecutionPlan, context: TaskContext): Promise<TaskExecution> {
    try {
      if (!this.isInitialized) {
        throw new Error('TaskExecutor not initialized')
      }

      const execution: TaskExecution = {
        id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        planId: plan.id,
        status: 'pending',
        currentStep: 0,
        totalSteps: plan.steps.length,
        startTime: new Date(),
        results: [],
        progress: 0,
        logs: [],
        metadata: {
          riskLevel: plan.riskLevel,
          fallbackStrategies: plan.fallbackStrategies
        }
      }

      // Register execution
      this.activeExecutions.set(execution.id, execution)
      this.emit('executionStarted', execution)

      // Execute steps sequentially
      execution.status = 'running'
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i]
        if (!step) {
          throw new Error(`Step at index ${i} is undefined`)
        }
        
        execution.currentStep = i + 1

        try {
          const result = await this.executeStep(step, {
            taskId: execution.id,
            stepId: step.id,
            parameters: step.parameters,
            validationRules: step.validationRules,
            context
          })

          execution.results.push(result)
          execution.progress = ((i + 1) / plan.steps.length) * 100

          this.emit('stepCompleted', {
            executionId: execution.id,
            stepId: step.id,
            result
          })

          // Check if execution was cancelled
          if (execution.status === 'cancelled' as any) {
            break
          }

        } catch (error) {
          const errorResult: TaskExecutionResult = {
            taskId: execution.id,
            stepId: step.id,
            status: 'failed',
            startTime: new Date(),
            endTime: new Date(),
            duration: 0,
            error: {
              message: error instanceof Error ? error.message : 'Unknown error',
              code: 'STEP_EXECUTION_FAILED',
              details: error
            },
            logs: [],
            metadata: {}
          }

          execution.results.push(errorResult)
          execution.status = 'failed'
          execution.endTime = new Date()
          execution.duration = execution.endTime.getTime() - execution.startTime.getTime()

          await this.errorHandler.handleError(
            error as Error,
            {
              module: 'TaskExecutor',
              operation: 'executeStep',
              parameters: {
                executionId: execution.id,
                stepId: step.id
              }
            },
            'high'
          )

          this.emit('executionFailed', {
            executionId: execution.id,
            stepId: step.id,
            error
          })

          break
        }
      }

      // Mark as completed if not failed or cancelled
      if (execution.status === 'running') {
        execution.status = 'completed'
        execution.endTime = new Date()
        execution.duration = execution.endTime.getTime() - execution.startTime.getTime()
        this.emit('executionCompleted', execution)
      }

      return execution

    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'TaskExecutor',
          operation: 'executePlan',
          parameters: {
            planId: plan.id
          }
        },
        'critical'
      )
      throw error
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: ExecutionStep, context: ExecutionContext): Promise<TaskExecutionResult> {
    const result: TaskExecutionResult = {
      taskId: context.taskId,
      stepId: context.stepId,
      status: 'pending',
      startTime: new Date(),
      logs: [],
      metadata: {}
    }

    try {
      // Validate step parameters
      await this.validateStepParameters(step, context)

      result.status = 'running'
      result.startTime = new Date()

      // Execute based on step type
      let stepResult: any
      switch (step.type) {
        case 'code_analysis':
          stepResult = await this.executeCodeAnalysis(step, context)
          break
        case 'browser_testing':
          stepResult = await this.executeBrowserTesting(step, context)
          break
        case 'file_operation':
          stepResult = await this.executeFileOperation(step, context)
          break
        case 'api_call':
          stepResult = await this.executeApiCall(step, context)
          break
        case 'custom':
          stepResult = await this.executeCustomStep(step, context)
          break
        default:
          throw new Error(`Unknown step type: ${step.type}`)
      }

      result.status = 'completed'
      result.endTime = new Date()
      result.duration = result.endTime.getTime() - result.startTime.getTime()
      result.result = stepResult

      return result

    } catch (error) {
      result.status = 'failed'
      result.endTime = new Date()
      result.duration = result.endTime.getTime() - result.startTime.getTime()
      result.error = {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'STEP_EXECUTION_FAILED',
        details: error
      }

      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'TaskExecutor',
          operation: 'executeStep',
          parameters: {
            stepId: step.id,
            stepType: step.type
          }
        },
        'high'
      )

      throw error
    }
  }

  /**
   * Execute code analysis step
   */
  private async executeCodeAnalysis(step: ExecutionStep, context: ExecutionContext): Promise<any> {
    const { projectPath, files, analysisType } = context.parameters

    // Create project analyzer if needed
    const projectAnalyzer = new ProjectAnalyzer(projectPath)

    switch (analysisType) {
      case 'impact':
        return await projectAnalyzer.analyzeStructure()
      case 'comprehensive':
        return await projectAnalyzer.analyzeStructure()
      default:
        return await projectAnalyzer.analyzeStructure()
    }
  }

  /**
   * Execute browser testing step
   */
  private async executeBrowserTesting(step: ExecutionStep, context: ExecutionContext): Promise<any> {
    const { browserRequirements, testType } = context.parameters

    // Create browser session
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const session = await this.browserManager.createSession(sessionId)

    try {
      const results: any[] = []

      for (const requirement of browserRequirements) {
        // Navigate to test URL
        await this.browserManager.navigateToUrl(session.sessionId, requirement.url)

        // Execute test based on type
        switch (testType) {
          case 'automated':
            const testResult = await this.browserManager.executeJavaScript(
              session.sessionId,
              requirement.testScript
            )
            results.push({
              requirement,
              result: testResult,
              status: 'completed'
            })
            break

          case 'screenshot':
            const screenshot = await this.browserManager.takeScreenshot(session.sessionId)
            results.push({
              requirement,
              result: screenshot,
              status: 'completed'
            })
            break

          default:
            throw new Error(`Unknown test type: ${testType}`)
        }
      }

      return {
        sessionId: session.sessionId,
        results,
        testType
      }

    } finally {
      // Clean up browser session
      await this.browserManager.closeSession(session.sessionId)
    }
  }

  /**
   * Execute file operation step
   */
  private async executeFileOperation(step: ExecutionStep, context: ExecutionContext): Promise<any> {
    const { projectPath, operations } = context.parameters

    const results: any[] = []

    for (const operation of operations) {
      switch (operation.type) {
        case 'read':
          const content = await this.fileSystemManager.readFile(operation.path)
          results.push({
            operation: 'read',
            path: operation.path,
            result: content
          })
          break

        case 'write':
          await this.fileSystemManager.writeFile(operation.path, operation.content)
          results.push({
            operation: 'write',
            path: operation.path,
            status: 'completed'
          })
          break

        case 'delete':
          await this.fileSystemManager.deleteFile(operation.path)
          results.push({
            operation: 'delete',
            path: operation.path,
            status: 'completed'
          })
          break

        case 'list':
          const files = await this.fileSystemManager.listDirectory(operation.path)
          results.push({
            operation: 'list',
            path: operation.path,
            result: files
          })
          break

        default:
          throw new Error(`Unknown file operation: ${operation.type}`)
      }
    }

    return {
      operations: results,
      projectPath
    }
  }

  /**
   * Execute API call step
   */
  private async executeApiCall(step: ExecutionStep, context: ExecutionContext): Promise<any> {
    const { url, method, headers, body } = context.parameters

    const fetchOptions: RequestInit = {
      method: method || 'GET',
      headers: headers || {}
    }
    
    if (body) {
      fetchOptions.body = JSON.stringify(body)
    }

    const response = await fetch(url, fetchOptions)

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    return {
      url,
      method,
      status: response.status,
      data
    }
  }

  /**
   * Execute custom step
   */
  private async executeCustomStep(step: ExecutionStep, context: ExecutionContext): Promise<any> {
    // For custom steps, we'll implement a plugin system
    // For now, return the parameters as-is
    return {
      stepType: 'custom',
      parameters: context.parameters,
      validationRules: context.validationRules
    }
  }

  /**
   * Validate step parameters
   */
  private async validateStepParameters(step: ExecutionStep, context: ExecutionContext): Promise<void> {
    const { validationRules } = context

    // Check required fields
    if (validationRules.requiredFields) {
      for (const field of validationRules.requiredFields) {
        if (!context.parameters[field]) {
          throw new Error(`Required field missing: ${field}`)
        }
      }
    }

    // Check file existence
    if (validationRules.fileExists) {
      const { projectPath } = context.parameters
      // Check if project path exists using listDirectory
      try {
        await this.fileSystemManager.listDirectory(projectPath)
      } catch {
        throw new Error(`Project path does not exist: ${projectPath}`)
      }
              // File exists check completed above
    }

    // Check browser availability
    if (validationRules.browserAvailable) {
      const sessions = this.browserManager.getAllSessions()
      if (sessions.length === 0) {
        throw new Error('No browser sessions available')
      }
    }

    // Check environment readiness
    if (validationRules.environmentReady) {
      const { environment } = context.context
      if (environment === 'production' && !validationRules.productionSafe) {
        throw new Error('Production environment requires additional safety checks')
      }
    }
  }

  /**
   * Cancel an active execution
   */
  async cancelExecution(executionId: string): Promise<void> {
    const execution = this.activeExecutions.get(executionId)
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`)
    }

    if (execution.status === 'running') {
      execution.status = 'cancelled'
      execution.endTime = new Date()
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime()

      this.emit('executionCancelled', execution)
    }
  }

  /**
   * Get execution status
   */
  getExecutionStatus(executionId: string): TaskExecution | null {
    return this.activeExecutions.get(executionId) || null
  }

  /**
   * Get all active executions
   */
  getActiveExecutions(): TaskExecution[] {
    return Array.from(this.activeExecutions.values())
  }

  /**
   * Clean up completed executions
   */
  cleanupCompletedExecutions(): void {
    for (const [id, execution] of this.activeExecutions.entries()) {
      if (['completed', 'failed', 'cancelled'].includes(execution.status)) {
        this.activeExecutions.delete(id)
      }
    }
  }

  /**
   * Get execution statistics
   */
  getExecutionStats(): {
    total: number
    running: number
    completed: number
    failed: number
    cancelled: number
  } {
    const stats = {
      total: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    }

    for (const execution of this.activeExecutions.values()) {
      stats.total++
      if (execution.status === 'running') {
        stats.running++
      } else if (execution.status === 'completed') {
        stats.completed++
      } else if (execution.status === 'failed') {
        stats.failed++
      } else if (execution.status === 'cancelled') {
        stats.cancelled++
      }
    }

    return stats
  }
} 