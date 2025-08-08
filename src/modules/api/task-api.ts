/**
 * Task API - Phase 3 Component
 * RESTful endpoints for task management operations
 * Provides comprehensive task CRUD operations with authentication and validation
 */

// import { Request, Response } from 'express'
import { TaskExecutionManager } from '../task-execution/index.js'
import { TaskRequirement, TaskContext } from '../task-execution/index.js'
import { ErrorHandler } from '../../core/error-handler.js'

// Simple interfaces to replace Express types
interface Request {
  body?: any
  params?: any
  query?: any
}

interface Response {
  success?: (data: any) => void
  error?: (message: string, code?: number) => void
  status?: (code: number) => Response
  json?: (data: any) => Response
}

export interface TaskAPIRequest extends Request {
  user?: {
    id: string
    permissions: string[]
  }
  taskExecutionManager?: TaskExecutionManager
}

export interface TaskAPIResponse extends Response {
  success: (data: any) => void
  error: (message: string, code?: number) => void
}

export interface CreateTaskRequest {
  title: string
  description: string
  type: 'development' | 'testing' | 'deployment' | 'analysis'
  priority: 'low' | 'medium' | 'high' | 'critical'
  estimatedDuration: number
  dependencies: string[]
  resources: string[]
  constraints: Record<string, any>
  projectPath: string
  currentBranch: string
  availableResources: string[]
  environment: 'development' | 'staging' | 'production'
  queueId?: string
  options?: {
    priority?: number
    scheduledFor?: string
    maxRetries?: number
    metadata?: Record<string, any>
  }
}

export interface UpdateTaskRequest {
  title?: string
  description?: string
  priority?: 'low' | 'medium' | 'high' | 'critical'
  estimatedDuration?: number
  dependencies?: string[]
  resources?: string[]
  constraints?: Record<string, any>
}

export interface TaskListRequest {
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  type?: 'development' | 'testing' | 'deployment' | 'analysis'
  priority?: 'low' | 'medium' | 'high' | 'critical'
  queueId?: string
  limit?: number
  offset?: number
}

export class TaskAPI {
  private taskExecutionManager: TaskExecutionManager
  private errorHandler: ErrorHandler
  private isInitialized = false

  constructor() {
    this.taskExecutionManager = new TaskExecutionManager()
    this.errorHandler = new ErrorHandler()
  }

  /**
   * Initialize the task API
   */
  async initialize(): Promise<void> {
    try {
      await this.errorHandler.initialize()
      await this.taskExecutionManager.initialize()
      this.isInitialized = true
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'TaskAPI',
          operation: 'initialize'
        },
        'critical'
      )
      throw error
    }
  }

  /**
   * Create a new task
   * POST /api/tasks
   */
  async createTask(req: TaskAPIRequest, res: TaskAPIResponse): Promise<void> {
    try {
      // Validate authentication
      if (!req.user) {
        return res.error('Unauthorized', 401)
      }

      // Validate permissions
      if (!req.user.permissions.includes('task:create')) {
        return res.error('Insufficient permissions', 403)
      }

      // Validate request body
      const validation = this.validateCreateTaskRequest(req.body)
      if (!validation.valid) {
        return res.error(validation.errors.join(', '), 400)
      }

      const request: CreateTaskRequest = req.body

      // Create task requirement
      const requirement: TaskRequirement = {
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: request.title,
        description: request.description,
        type: request.type,
        priority: request.priority,
        estimatedDuration: request.estimatedDuration,
        dependencies: request.dependencies,
        resources: request.resources,
        constraints: request.constraints
      }

      // Create task context
      const context: TaskContext = {
        projectPath: request.projectPath,
        currentBranch: request.currentBranch,
        availableResources: request.availableResources,
        constraints: request.constraints,
        environment: request.environment
      }

      // Submit task to scheduler
      const taskOptions: any = { ...request.options }
      if (request.options?.scheduledFor) {
        taskOptions.scheduledFor = new Date(request.options.scheduledFor)
      }

      const taskId = await this.taskExecutionManager
        .getTaskScheduler()
        .submitTask(requirement, context, request.queueId, taskOptions)

      // Return success response
      res.success({
        taskId,
        status: 'submitted',
        message: 'Task created successfully'
      })

    } catch (error) {
      const errorContext: any = {
        module: 'TaskAPI',
        operation: 'createTask'
      }
      if (req.user?.id) {
        errorContext.userId = req.user.id
      }

      await this.errorHandler.handleError(
        error as Error,
        errorContext,
        'high'
      )

      res.error('Failed to create task', 500)
    }
  }

  /**
   * Get task by ID
   * GET /api/tasks/:taskId
   */
  async getTask(req: TaskAPIRequest, res: TaskAPIResponse): Promise<void> {
    try {
      // Validate authentication
      if (!req.user) {
        return res.error('Unauthorized', 401)
      }

      // Validate permissions
      if (!req.user.permissions.includes('task:read')) {
        return res.error('Insufficient permissions', 403)
      }

      const { taskId } = req.params

      // Get task from scheduler
      const scheduler = this.taskExecutionManager.getTaskScheduler()
      const queues = scheduler.getAllQueues()

      // Search for task in queues
      let task = null
      let queueId = null

      for (const queue of queues) {
        const foundTask = queue.queuedTasks.find(t => t.id === taskId)
        if (foundTask) {
          task = foundTask
          queueId = queue.id
          break
        }
      }

      // Search in active executions
      if (!task) {
        const executor = this.taskExecutionManager.getTaskExecutor()
        const execution = executor.getExecutionStatus(taskId)
        if (execution) {
          task = {
            id: execution.id,
            requirement: {
              id: execution.id,
              title: 'Active Execution',
              description: 'Task currently being executed',
              type: 'development',
              priority: 'medium',
              estimatedDuration: 0,
              dependencies: [],
              resources: [],
              constraints: {}
            },
            context: {
              projectPath: '',
              currentBranch: '',
              availableResources: [],
              constraints: {},
              environment: 'development'
            },
            priority: 50,
            createdAt: execution.startTime,
            retryCount: 0,
            maxRetries: 3,
            metadata: execution.metadata
          }
          queueId = 'active'
        }
      }

      if (!task) {
        return res.error('Task not found', 404)
      }

      res.success({
        task,
        queueId,
        status: 'found'
      })

    } catch (error) {
      const errorContext: any = {
        module: 'TaskAPI',
        operation: 'getTask',
        parameters: {
          taskId: req.params?.taskId
        }
      }
      if (req.user?.id) {
        errorContext.parameters.userId = req.user.id
      }

      await this.errorHandler.handleError(
        error as Error,
        errorContext,
        'medium'
      )

      res.error('Failed to get task', 500)
    }
  }

  /**
   * List tasks with filtering
   * GET /api/tasks
   */
  async listTasks(req: TaskAPIRequest, res: TaskAPIResponse): Promise<void> {
    try {
      // Validate authentication
      if (!req.user) {
        return res.error('Unauthorized', 401)
      }

      // Validate permissions
      if (!req.user.permissions.includes('task:read')) {
        return res.error('Insufficient permissions', 403)
      }

      const filters: TaskListRequest = req.query as any
      const scheduler = this.taskExecutionManager.getTaskScheduler()
      const executor = this.taskExecutionManager.getTaskExecutor()

      const allTasks: any[] = []

      // Get tasks from queues
      const queues = scheduler.getAllQueues()
      for (const queue of queues) {
        for (const task of queue.queuedTasks) {
          if (this.matchesFilters(task, filters)) {
            allTasks.push({
              ...task,
              queueId: queue.id,
              status: 'queued'
            })
          }
        }
      }

      // Get active executions
      const activeExecutions = executor.getActiveExecutions()
      for (const execution of activeExecutions) {
        if (this.matchesExecutionFilters(execution, filters)) {
          allTasks.push({
            id: execution.id,
            requirement: {
              id: execution.id,
              title: 'Active Execution',
              description: 'Task currently being executed',
              type: 'development',
              priority: 'medium',
              estimatedDuration: 0,
              dependencies: [],
              resources: [],
              constraints: {}
            },
            context: {
              projectPath: '',
              currentBranch: '',
              availableResources: [],
              constraints: {},
              environment: 'development'
            },
            priority: 50,
            createdAt: execution.startTime,
            retryCount: 0,
            maxRetries: 3,
            metadata: execution.metadata,
            status: execution.status,
            progress: execution.progress
          })
        }
      }

      // Apply pagination
      const limit = filters.limit || 50
      const offset = filters.offset || 0
      const paginatedTasks = allTasks.slice(offset, offset + limit)

      res.success({
        tasks: paginatedTasks,
        total: allTasks.length,
        limit,
        offset,
        hasMore: offset + limit < allTasks.length
      })

    } catch (error) {
      const errorContext: any = {
        module: 'TaskAPI',
        operation: 'listTasks'
      }
      if (req.user?.id) {
        errorContext.userId = req.user.id
      }

      await this.errorHandler.handleError(
        error as Error,
        errorContext,
        'medium'
      )

      res.error('Failed to list tasks', 500)
    }
  }

  /**
   * Update task
   * PUT /api/tasks/:taskId
   */
  async updateTask(req: TaskAPIRequest, res: TaskAPIResponse): Promise<void> {
    try {
      // Validate authentication
      if (!req.user) {
        return res.error('Unauthorized', 401)
      }

      // Validate permissions
      if (!req.user.permissions.includes('task:update')) {
        return res.error('Insufficient permissions', 403)
      }

      const { taskId } = req.params
      const updates: UpdateTaskRequest = req.body

      // Validate request body
      const validation = this.validateUpdateTaskRequest(updates)
      if (!validation.valid) {
        return res.error(validation.errors.join(', '), 400)
      }

      // Find and update task
      const scheduler = this.taskExecutionManager.getTaskScheduler()
      const queues = scheduler.getAllQueues()

      let updated = false
      for (const queue of queues) {
        const taskIndex = queue.queuedTasks.findIndex(t => t.id === taskId)
        if (taskIndex !== -1) {
          const task = queue.queuedTasks[taskIndex]
          
          if (!task) {
            return res.error('Task not found', 404)
          }
          
          // Update task properties
          if (updates.title) task.requirement.title = updates.title
          if (updates.description) task.requirement.description = updates.description
          if (updates.priority) task.requirement.priority = updates.priority
          if (updates.estimatedDuration) task.requirement.estimatedDuration = updates.estimatedDuration
          if (updates.dependencies) task.requirement.dependencies = updates.dependencies
          if (updates.resources) task.requirement.resources = updates.resources
          if (updates.constraints) task.requirement.constraints = updates.constraints

          // Recalculate priority
          task.priority = this.calculatePriority(task.requirement.priority)

          // Re-sort queue
          scheduler['sortQueueByPriority'](queue)

          updated = true
          break
        }
      }

      if (!updated) {
        return res.error('Task not found or cannot be updated', 404)
      }

      res.success({
        taskId,
        status: 'updated',
        message: 'Task updated successfully'
      })

    } catch (error) {
      const errorContext: any = {
        module: 'TaskAPI',
        operation: 'updateTask',
        parameters: {
          taskId: req.params?.taskId
        }
      }
      if (req.user?.id) {
        errorContext.parameters.userId = req.user.id
      }

      await this.errorHandler.handleError(
        error as Error,
        errorContext,
        'medium'
      )

      res.error('Failed to update task', 500)
    }
  }

  /**
   * Cancel task
   * DELETE /api/tasks/:taskId
   */
  async cancelTask(req: TaskAPIRequest, res: TaskAPIResponse): Promise<void> {
    try {
      // Validate authentication
      if (!req.user) {
        return res.error('Unauthorized', 401)
      }

      // Validate permissions
      if (!req.user.permissions.includes('task:cancel')) {
        return res.error('Insufficient permissions', 403)
      }

      const { taskId } = req.params

      // Cancel task
      await this.taskExecutionManager.getTaskScheduler().cancelTask(taskId)

      res.success({
        taskId,
        status: 'cancelled',
        message: 'Task cancelled successfully'
      })

    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'TaskAPI',
          operation: 'cancelTask',
          parameters: {
            taskId: req.params?.taskId,
            userId: req.user?.id
          }
        },
        'medium'
      )

      res.error('Failed to cancel task', 500)
    }
  }

  /**
   * Get task statistics
   * GET /api/tasks/stats
   */
  async getTaskStats(req: TaskAPIRequest, res: TaskAPIResponse): Promise<void> {
    try {
      // Validate authentication
      if (!req.user) {
        return res.error('Unauthorized', 401)
      }

      // Validate permissions
      if (!req.user.permissions.includes('task:read')) {
        return res.error('Insufficient permissions', 403)
      }

      const scheduler = this.taskExecutionManager.getTaskScheduler()
      const executor = this.taskExecutionManager.getTaskExecutor()

      const schedulerStats = scheduler.getSchedulerStats()
      const executorStats = executor.getExecutionStats()

      res.success({
        scheduler: schedulerStats,
        executor: executorStats,
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      const errorContext: any = {
        module: 'TaskAPI',
        operation: 'getTaskStats'
      }
      if (req.user?.id) {
        errorContext.userId = req.user.id
      }

      await this.errorHandler.handleError(
        error as Error,
        errorContext,
        'medium'
      )

      res.error('Failed to get task statistics', 500)
    }
  }

  /**
   * Validate create task request
   */
  private validateCreateTaskRequest(body: any): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    const required = ['title', 'description', 'type', 'priority', 'estimatedDuration', 'projectPath']

    for (const field of required) {
      if (!body[field]) {
        errors.push(`Missing required field: ${field}`)
      }
    }

    if (body.type && !['development', 'testing', 'deployment', 'analysis'].includes(body.type)) {
      errors.push('Invalid task type')
    }

    if (body.priority && !['low', 'medium', 'high', 'critical'].includes(body.priority)) {
      errors.push('Invalid priority level')
    }

    if (body.estimatedDuration && (typeof body.estimatedDuration !== 'number' || body.estimatedDuration <= 0)) {
      errors.push('Estimated duration must be a positive number')
    }

    if (body.environment && !['development', 'staging', 'production'].includes(body.environment)) {
      errors.push('Invalid environment')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Validate update task request
   */
  private validateUpdateTaskRequest(body: any): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (body.type && !['development', 'testing', 'deployment', 'analysis'].includes(body.type)) {
      errors.push('Invalid task type')
    }

    if (body.priority && !['low', 'medium', 'high', 'critical'].includes(body.priority)) {
      errors.push('Invalid priority level')
    }

    if (body.estimatedDuration && (typeof body.estimatedDuration !== 'number' || body.estimatedDuration <= 0)) {
      errors.push('Estimated duration must be a positive number')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Check if task matches filters
   */
  private matchesFilters(task: any, filters: TaskListRequest): boolean {
    if (filters.status && task.status !== filters.status) return false
    if (filters.type && task.requirement.type !== filters.type) return false
    if (filters.priority && task.requirement.priority !== filters.priority) return false
    if (filters.queueId && task.queueId !== filters.queueId) return false
    return true
  }

  /**
   * Check if execution matches filters
   */
  private matchesExecutionFilters(execution: any, filters: TaskListRequest): boolean {
    if (filters.status && execution.status !== filters.status) return false
    return true
  }

  /**
   * Calculate numeric priority
   */
  private calculatePriority(priority: 'low' | 'medium' | 'high' | 'critical'): number {
    switch (priority) {
      case 'critical': return 100
      case 'high': return 75
      case 'medium': return 50
      case 'low': return 25
      default: return 50
    }
  }
} 