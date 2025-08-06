/**
 * Memory Module - Phase 4
 * Main entry point for the memory system
 * Provides unified interface for memory storage, retrieval, and session management
 */

export { MemoryStore } from './memory-store'
export type { MemoryEntry, MemoryQuery, MemorySearchResult, VectorDatabaseConfig } from './memory-store'
export { SessionMemoryManager } from './session-memory-manager'
export type { SessionState, SessionMemoryConfig } from './session-memory-manager'

import { MemoryStore, VectorDatabaseConfig } from './memory-store'
import { SessionMemoryManager, SessionMemoryConfig } from './session-memory-manager'
import { ErrorHandler } from '../../core/error-handler'

/**
 * Memory Manager
 * Unified interface for memory operations
 */
export class MemoryManager {
  private memoryStore: MemoryStore
  private sessionMemoryManager: SessionMemoryManager
  private errorHandler: ErrorHandler
  private isInitialized = false

  constructor(
    vectorConfig: VectorDatabaseConfig,
    sessionConfig: SessionMemoryConfig
  ) {
    this.memoryStore = new MemoryStore(vectorConfig)
    this.sessionMemoryManager = new SessionMemoryManager(this.memoryStore, sessionConfig)
    this.errorHandler = new ErrorHandler()
  }

  /**
   * Initialize the memory manager
   */
  async initialize(): Promise<void> {
    try {
      await this.errorHandler.initialize()
      await this.memoryStore.initialize()
      await this.sessionMemoryManager.initialize()

      this.isInitialized = true
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'MemoryManager',
          operation: 'initialize'
        },
        'critical'
      )
      throw error
    }
  }

  /**
   * Get the memory store instance
   */
  getMemoryStore(): MemoryStore {
    return this.memoryStore
  }

  /**
   * Get the session memory manager instance
   */
  getSessionMemoryManager(): SessionMemoryManager {
    return this.sessionMemoryManager
  }

  /**
   * Get system status
   */
  getStatus(): {
    isInitialized: boolean
    memoryStore: any
    sessionMemory: any
  } {
    return {
      isInitialized: this.isInitialized,
      memoryStore: this.memoryStore,
      sessionMemory: this.sessionMemoryManager
    }
  }

  /**
   * Shutdown the memory manager
   */
  async shutdown(): Promise<void> {
    try {
      await this.sessionMemoryManager.shutdown()
      await this.memoryStore.shutdown()
      this.isInitialized = false
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'MemoryManager',
          operation: 'shutdown'
        },
        'critical'
      )
      throw error
    }
  }
} 