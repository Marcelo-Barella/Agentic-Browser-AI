/**
 * Task Scheduler - Phase 3 Component
 * Manages task queuing, prioritization, and concurrency control
 * Integrates with TaskPlanner and TaskExecutor for comprehensive task management
 */

import { EventEmitter } from 'events'
import { TaskPlanner, TaskRequirement, ExecutionPlan, TaskContext } from './task-planner'
import { TaskExecutor, TaskExecution } from './task-executor'
import { ErrorHandler } from '../../core/error-handler'

export interface QueuedTask {
  id: string
  requirement: TaskRequirement
  context: TaskContext
  priority: number
  createdAt: Date
  scheduledFor?: Date
  retryCount: number
  maxRetries: number
  metadata: Record<string, any>
}

export interface TaskQueue {
  id: string
  name: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  maxConcurrent: number
  activeExecutions: number
  queuedTasks: QueuedTask[]
  createdAt: Date
  updatedAt: Date
}

export interface SchedulerConfig {
  maxConcurrentExecutions: number
  defaultRetryCount: number
  retryDelayMs: number
  queueTimeoutMs: number
  enableAutoScaling: boolean
  maxQueueSize: number
}

export interface SchedulerStats {
  totalQueued: number
  totalExecuted: number
  totalFailed: number
  totalRetried: number
  averageExecutionTime: number
  queueUtilization: number
  activeExecutions: number
  availableCapacity: number
}

export class TaskScheduler extends EventEmitter {
  private taskPlanner: TaskPlanner
  private taskExecutor: TaskExecutor
  private errorHandler: ErrorHandler
  private queues: Map<string, TaskQueue> = new Map()
  private activeExecutions: Map<string, TaskExecution> = new Map()
  private config: SchedulerConfig
  private isInitialized = false

  constructor(config: Partial<SchedulerConfig> = {}) {
    super()
    this.taskPlanner = new TaskPlanner()
    this.taskExecutor = new TaskExecutor()
    this.errorHandler = new ErrorHandler()
    this.config = {
      maxConcurrentExecutions: 5,
      defaultRetryCount: 3,
      retryDelayMs: 5000,
      queueTimeoutMs: 300000, // 5 minutes
      enableAutoScaling: true,
      maxQueueSize: 100,
      ...config
    }
  }

  /**
   * Initialize the task scheduler
   */
  async initialize(): Promise<void> {
    try {
      await this.errorHandler.initialize()
      await this.taskPlanner.initialize()
      await this.taskExecutor.initialize()

      // Set up event listeners
      this.setupEventListeners()

      // Mark as initialized before creating queues
      this.isInitialized = true

      // Create default queues
      await this.createDefaultQueues()
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'TaskScheduler',
          operation: 'initialize'
        },
        'critical'
      )
      throw error
    }
  }

  /**
   * Create a new task queue
   */
  async createQueue(
    name: string,
    priority: 'low' | 'medium' | 'high' | 'critical',
    maxConcurrent: number = 1
  ): Promise<TaskQueue> {
    try {
      if (!this.isInitialized) {
        throw new Error('TaskScheduler not initialized')
      }

      const queue: TaskQueue = {
        id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        priority,
        maxConcurrent,
        activeExecutions: 0,
        queuedTasks: [],
        createdAt: new Date(),
        updatedAt: new Date()
      }

      this.queues.set(queue.id, queue)
      this.emit('queueCreated', queue)

      return queue
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'TaskScheduler',
          operation: 'createQueue',
          parameters: {
            queueName: name
          }
        },
        'high'
      )
      throw error
    }
  }

  /**
   * Submit a task for execution
   */
  async submitTask(
    requirement: TaskRequirement,
    context: TaskContext,
    queueId?: string,
    options: {
      priority?: number
      scheduledFor?: Date
      maxRetries?: number
      metadata?: Record<string, any>
    } = {}
  ): Promise<string> {
    try {
      if (!this.isInitialized) {
        throw new Error('TaskScheduler not initialized')
      }

      // Determine target queue
      const targetQueueId = queueId || this.selectBestQueue(requirement.priority)
      const queue = this.queues.get(targetQueueId)
      if (!queue) {
        throw new Error(`Queue not found: ${targetQueueId}`)
      }

      // Check queue capacity
      if (queue.queuedTasks.length >= this.config.maxQueueSize) {
        throw new Error(`Queue ${queue.name} is at maximum capacity`)
      }

      // Create queued task
      const queuedTask: QueuedTask = {
        id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        requirement,
        context,
        priority: options.priority || this.calculatePriority(requirement.priority),
        createdAt: new Date(),
        retryCount: 0,
        maxRetries: options.maxRetries || this.config.defaultRetryCount,
        metadata: options.metadata || {}
      }

      // Add scheduledFor only if it's defined
      if (options.scheduledFor) {
        queuedTask.scheduledFor = options.scheduledFor
      }

      // Add to queue
      queue.queuedTasks.push(queuedTask)
      queue.updatedAt = new Date()

      // Sort queue by priority
      this.sortQueueByPriority(queue)

      this.emit('taskSubmitted', {
        taskId: queuedTask.id,
        queueId: queue.id,
        requirement: requirement.title
      })

      // Try to process queue
      await this.processQueue(queue.id)

      return queuedTask.id
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'TaskScheduler',
          operation: 'submitTask',
          parameters: {
            requirementId: requirement.id
          }
        },
        'high'
      )
      throw error
    }
  }

  /**
   * Process a specific queue
   */
  async processQueue(queueId: string): Promise<void> {
    const queue = this.queues.get(queueId)
    if (!queue) return

    // Check if we can start new executions
    const availableSlots = queue.maxConcurrent - queue.activeExecutions
    if (availableSlots <= 0) return

    // Get tasks that are ready to execute
    const readyTasks = queue.queuedTasks.filter(task => {
      if (task.scheduledFor && task.scheduledFor > new Date()) {
        return false // Not yet scheduled
      }
      return true
    })

    // Start executions for available slots
    const tasksToExecute = readyTasks.slice(0, availableSlots)
    for (const queuedTask of tasksToExecute) {
      await this.executeQueuedTask(queue, queuedTask)
    }
  }

  /**
   * Execute a queued task
   */
  private async executeQueuedTask(queue: TaskQueue, queuedTask: QueuedTask): Promise<void> {
    try {
      // Remove from queue
      const taskIndex = queue.queuedTasks.findIndex(t => t.id === queuedTask.id)
      if (taskIndex !== -1) {
        queue.queuedTasks.splice(taskIndex, 1)
      }

      // Update queue stats
      queue.activeExecutions++
      queue.updatedAt = new Date()

      // Create execution plan
      const plan = await this.taskPlanner.createExecutionPlan(queuedTask.requirement, queuedTask.context)

      // Execute the plan
      const execution = await this.taskExecutor.executePlan(plan, queuedTask.context)

      // Track execution
      this.activeExecutions.set(execution.id, execution)

      this.emit('taskStarted', {
        taskId: queuedTask.id,
        executionId: execution.id,
        queueId: queue.id
      })

      // Handle execution completion
      this.handleExecutionCompletion(queue, queuedTask, execution)

    } catch (error) {
      // Handle execution failure
      await this.handleExecutionFailure(queue, queuedTask, error as Error)
    }
  }

  /**
   * Handle execution completion
   */
  private handleExecutionCompletion(
    queue: TaskQueue,
    queuedTask: QueuedTask,
    execution: TaskExecution
  ): void {
    // Update queue stats
    queue.activeExecutions--
    queue.updatedAt = new Date()

    // Remove from active executions
    this.activeExecutions.delete(execution.id)

    this.emit('taskCompleted', {
      taskId: queuedTask.id,
      executionId: execution.id,
      queueId: queue.id,
      status: execution.status
    })

    // Process queue again
    this.processQueue(queue.id)
  }

  /**
   * Handle execution failure
   */
  private async handleExecutionFailure(
    queue: TaskQueue,
    queuedTask: QueuedTask,
    error: Error
  ): Promise<void> {
    // Update queue stats
    queue.activeExecutions--
    queue.updatedAt = new Date()

    // Check if we should retry
    if (queuedTask.retryCount < queuedTask.maxRetries) {
      queuedTask.retryCount++
      queuedTask.createdAt = new Date() // Reset creation time for retry delay

      // Add back to queue with delay
      setTimeout(() => {
        queue.queuedTasks.push(queuedTask)
        this.sortQueueByPriority(queue)
        this.processQueue(queue.id)
      }, this.config.retryDelayMs * queuedTask.retryCount)

      this.emit('taskRetried', {
        taskId: queuedTask.id,
        queueId: queue.id,
        retryCount: queuedTask.retryCount,
        maxRetries: queuedTask.maxRetries
      })
    } else {
      // Max retries exceeded
      this.emit('taskFailed', {
        taskId: queuedTask.id,
        queueId: queue.id,
        error: error.message,
        retryCount: queuedTask.retryCount
      })

      await this.errorHandler.handleError(
        error,
        {
          module: 'TaskScheduler',
          operation: 'executeQueuedTask',
          parameters: {
            taskId: queuedTask.id,
            retryCount: queuedTask.retryCount
          }
        },
        'high'
      )
    }

    // Process queue again
    this.processQueue(queue.id)
  }

  /**
   * Cancel a queued task
   */
  async cancelTask(taskId: string): Promise<void> {
    try {
      // Find task in queues
      for (const queue of this.queues.values()) {
        const taskIndex = queue.queuedTasks.findIndex(t => t.id === taskId)
        if (taskIndex !== -1) {
          queue.queuedTasks.splice(taskIndex, 1)
          queue.updatedAt = new Date()
          this.emit('taskCancelled', { taskId, queueId: queue.id })
          return
        }
      }

      // Check if task is currently executing
      const execution = this.activeExecutions.get(taskId)
      if (execution) {
        await this.taskExecutor.cancelExecution(execution.id)
        this.emit('taskCancelled', { taskId, executionId: execution.id })
      }

    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'TaskScheduler',
          operation: 'cancelTask',
          parameters: {
            taskId
          }
        },
        'medium'
      )
      throw error
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus(queueId: string): TaskQueue | null {
    return this.queues.get(queueId) || null
  }

  /**
   * Get all queues
   */
  getAllQueues(): TaskQueue[] {
    return Array.from(this.queues.values())
  }

  /**
   * Get scheduler statistics
   */
  getSchedulerStats(): SchedulerStats {
    const stats: SchedulerStats = {
      totalQueued: 0,
      totalExecuted: 0,
      totalFailed: 0,
      totalRetried: 0,
      averageExecutionTime: 0,
      queueUtilization: 0,
      activeExecutions: this.activeExecutions.size,
      availableCapacity: this.config.maxConcurrentExecutions - this.activeExecutions.size
    }

    // Calculate queue statistics
    for (const queue of this.queues.values()) {
      stats.totalQueued += queue.queuedTasks.length
      stats.totalExecuted += queue.activeExecutions
    }

    // Calculate utilization
    const totalCapacity = Array.from(this.queues.values()).reduce(
      (sum, queue) => sum + queue.maxConcurrent,
      0
    )
    stats.queueUtilization = totalCapacity > 0 ? (stats.activeExecutions / totalCapacity) * 100 : 0

    return stats
  }

  /**
   * Select the best queue for a task priority
   */
  private selectBestQueue(priority: 'low' | 'medium' | 'high' | 'critical'): string {
    const priorityQueues = Array.from(this.queues.values()).filter(
      queue => queue.priority === priority
    )

    if (priorityQueues.length === 0) {
      // Fallback to any available queue
      const availableQueues = Array.from(this.queues.values())
      return availableQueues[0]?.id || 'default'
    }

    // Select queue with least load
    return priorityQueues.reduce((best, current) => {
      const bestLoad = best.activeExecutions / best.maxConcurrent
      const currentLoad = current.activeExecutions / current.maxConcurrent
      return currentLoad < bestLoad ? current : best
    }).id
  }

  /**
   * Calculate numeric priority from string priority
   */
  private calculatePriority(priority: 'low' | 'medium' | 'high' | 'critical'): number {
    switch (priority) {
      case 'critical':
        return 100
      case 'high':
        return 75
      case 'medium':
        return 50
      case 'low':
        return 25
      default:
        return 50
    }
  }

  /**
   * Sort queue by priority (highest first)
   */
  private sortQueueByPriority(queue: TaskQueue): void {
    queue.queuedTasks.sort((a, b) => b.priority - a.priority)
  }

  /**
   * Create default queues
   */
  private async createDefaultQueues(): Promise<void> {
    await this.createQueue('critical', 'critical', 2)
    await this.createQueue('high', 'high', 3)
    await this.createQueue('medium', 'medium', 5)
    await this.createQueue('low', 'low', 10)
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen to task executor events
    this.taskExecutor.on('executionStarted', (execution) => {
      this.emit('executionStarted', execution)
    })

    this.taskExecutor.on('executionCompleted', (execution) => {
      this.emit('executionCompleted', execution)
    })

    this.taskExecutor.on('executionFailed', (data) => {
      this.emit('executionFailed', data)
    })

    this.taskExecutor.on('executionCancelled', (execution) => {
      this.emit('executionCancelled', execution)
    })
  }

  /**
   * Clean up completed executions
   */
  cleanupCompletedExecutions(): void {
    this.taskExecutor.cleanupCompletedExecutions()
  }

  /**
   * Shutdown the scheduler
   */
  async shutdown(): Promise<void> {
    try {
      // Cancel all active executions
      for (const execution of this.activeExecutions.values()) {
        await this.taskExecutor.cancelExecution(execution.id)
      }

      // Clear queues
      this.queues.clear()
      this.activeExecutions.clear()

      this.emit('schedulerShutdown')
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'TaskScheduler',
          operation: 'shutdown'
        },
        'critical'
      )
      throw error
    }
  }
} 