/**
 * Task Execution Module - Phase 4
 * Main entry point for task execution functionality
 * Provides unified interface for task planning, execution, and scheduling
 */

export { TaskPlanner } from './task-planner.js'
export type { TaskRequirement, ExecutionPlan, ExecutionStep, TaskContext } from './task-planner.js'
export { TaskExecutor } from './task-executor.js'
export type { TaskExecution, TaskExecutionResult } from './task-executor.js'
export { TaskScheduler } from './task-scheduler.js'
export type { QueuedTask, TaskQueue, SchedulerConfig, SchedulerStats } from './task-scheduler.js'

import { TaskPlanner } from './task-planner.js'
import { TaskExecutor } from './task-executor.js'
import { TaskScheduler } from './task-scheduler.js'
import { ErrorHandler } from '../../core/error-handler.js'

/**
 * Task Execution Manager
 * Unified interface for task execution operations
 */
export class TaskExecutionManager {
  private taskPlanner: TaskPlanner
  private taskExecutor: TaskExecutor
  private taskScheduler: TaskScheduler
  private errorHandler: ErrorHandler
  private isInitialized = false

  constructor() {
    this.taskPlanner = new TaskPlanner()
    this.taskExecutor = new TaskExecutor()
    this.taskScheduler = new TaskScheduler()
    this.errorHandler = new ErrorHandler()
  }

  /**
   * Initialize the task execution manager
   */
  async initialize(): Promise<void> {
    try {
      await this.errorHandler.initialize()
      await this.taskPlanner.initialize()
      await this.taskExecutor.initialize()
      await this.taskScheduler.initialize()

      this.isInitialized = true
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'TaskExecutionManager',
          operation: 'initialize'
        },
        'critical'
      )
      throw error
    }
  }

  /**
   * Get the task planner instance
   */
  getTaskPlanner(): TaskPlanner {
    return this.taskPlanner
  }

  /**
   * Get the task executor instance
   */
  getTaskExecutor(): TaskExecutor {
    return this.taskExecutor
  }

  /**
   * Get the task scheduler instance
   */
  getTaskScheduler(): TaskScheduler {
    return this.taskScheduler
  }

  /**
   * Get system status
   */
  getStatus(): {
    isInitialized: boolean
    planner: any
    executor: any
    scheduler: any
  } {
    return {
      isInitialized: this.isInitialized,
      planner: this.taskPlanner,
      executor: this.taskExecutor,
      scheduler: this.taskScheduler
    }
  }

  /**
   * Shutdown the task execution manager
   */
  async shutdown(): Promise<void> {
    try {
      await this.taskScheduler.shutdown()
      this.isInitialized = false
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'TaskExecutionManager',
          operation: 'shutdown'
        },
        'critical'
      )
      throw error
    }
  }
} 