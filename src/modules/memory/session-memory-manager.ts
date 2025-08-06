/**
 * Session Memory Manager - Phase 4
 * Manages session state and persistence for the memory system
 * Integrates with MemoryStore for cross-session memory retention
 */

import { EventEmitter } from 'events'
import { MemoryStore, MemoryEntry, MemoryQuery } from './memory-store'

export interface SessionState {
  sessionId: string
  userId: string
  createdAt: Date
  lastActivity: Date
  context: Record<string, any>
  preferences: Record<string, any>
  activeTasks: string[]
  memoryTags: string[]
}

export interface SessionMemoryConfig {
  maxSessionDuration: number // milliseconds
  maxMemoryPerSession: number
  autoCleanup: boolean
  encryptionEnabled: boolean
}

export class SessionMemoryManager extends EventEmitter {
  private memoryStore: MemoryStore
  private config: SessionMemoryConfig
  private sessions: Map<string, SessionState> = new Map()
  private isInitialized = false

  constructor(memoryStore: MemoryStore, config: SessionMemoryConfig) {
    super()
    this.memoryStore = memoryStore
    this.config = config
  }

  /**
   * Initialize the session memory manager
   */
  async initialize(): Promise<void> {
    try {
      console.log('🧠 Initializing Session Memory Manager...')

      // Set up auto-cleanup if enabled
      if (this.config.autoCleanup) {
        this.setupAutoCleanup()
      }

      this.isInitialized = true
      console.log('✅ Session Memory Manager initialized')
      this.emit('initialized')
    } catch (error) {
      console.error('❌ Failed to initialize Session Memory Manager:', error)
      throw error
    }
  }

  /**
   * Create a new session
   */
  async createSession(sessionId: string, userId: string, context: Record<string, any> = {}): Promise<SessionState> {
    if (!this.isInitialized) {
      throw new Error('Session Memory Manager not initialized')
    }

    const sessionState: SessionState = {
      sessionId,
      userId,
      createdAt: new Date(),
      lastActivity: new Date(),
      context,
      preferences: {},
      activeTasks: [],
      memoryTags: []
    }

    this.sessions.set(sessionId, sessionState)

    // Store session creation in memory
    await this.memoryStore.store({
      content: `Session created for user ${userId}`,
      metadata: {
        type: 'session_created',
        sessionId,
        userId,
        context
      },
      sessionId,
      tags: ['session', 'creation'],
      priority: 'medium'
    })

    this.emit('sessionCreated', sessionState)
    return sessionState
  }

  /**
   * Get session state
   */
  getSession(sessionId: string): SessionState | null {
    if (!this.isInitialized) {
      throw new Error('Session Memory Manager not initialized')
    }

    const session = this.sessions.get(sessionId)
    if (session) {
      // Update last activity
      session.lastActivity = new Date()
    }
    return session || null
  }

  /**
   * Update session context
   */
  async updateSessionContext(sessionId: string, context: Record<string, any>): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Session Memory Manager not initialized')
    }

    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    session.context = { ...session.context, ...context }
    session.lastActivity = new Date()

    // Store context update in memory
    await this.memoryStore.store({
      content: `Session context updated`,
      metadata: {
        type: 'session_context_updated',
        sessionId,
        context: session.context
      },
      sessionId,
      tags: ['session', 'context'],
      priority: 'low'
    })

    this.emit('sessionContextUpdated', session)
  }

  /**
   * Update session preferences
   */
  async updateSessionPreferences(sessionId: string, preferences: Record<string, any>): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Session Memory Manager not initialized')
    }

    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    session.preferences = { ...session.preferences, ...preferences }
    session.lastActivity = new Date()

    // Store preference update in memory
    await this.memoryStore.store({
      content: `Session preferences updated`,
      metadata: {
        type: 'session_preferences_updated',
        sessionId,
        preferences: session.preferences
      },
      sessionId,
      tags: ['session', 'preferences'],
      priority: 'low'
    })

    this.emit('sessionPreferencesUpdated', session)
  }

  /**
   * Add memory entry for session
   */
  async addSessionMemory(
    sessionId: string,
    content: string,
    metadata: Record<string, any> = {},
    tags: string[] = [],
    priority: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Session Memory Manager not initialized')
    }

    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    // Add session-specific tags
    const sessionTags = [...tags, 'session', sessionId]
    session.memoryTags.push(...tags)

    // Store memory entry
    const memoryId = await this.memoryStore.store({
      content,
      metadata: {
        ...metadata,
        sessionId,
        userId: session.userId
      },
      sessionId,
      tags: sessionTags,
      priority
    })

    session.lastActivity = new Date()
    this.emit('sessionMemoryAdded', { sessionId, memoryId, content })

    return memoryId
  }

  /**
   * Retrieve session memories
   */
  async getSessionMemories(
    sessionId: string,
    query: MemoryQuery = {}
  ): Promise<MemoryEntry[]> {
    if (!this.isInitialized) {
      throw new Error('Session Memory Manager not initialized')
    }

    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    // Add session filter to query
    const sessionQuery: MemoryQuery = {
      ...query,
      sessionId
    }

    return await this.memoryStore.list(sessionQuery)
  }

  /**
   * Search session memories by similarity
   */
  async searchSessionMemories(
    sessionId: string,
    query: MemoryQuery
  ): Promise<MemoryEntry[]> {
    if (!this.isInitialized) {
      throw new Error('Session Memory Manager not initialized')
    }

    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    // Add session filter to query
    const sessionQuery: MemoryQuery = {
      ...query,
      sessionId
    }

    const results = await this.memoryStore.search(sessionQuery)
    return results.map(result => result.entry)
  }

  /**
   * Get session memories by tags
   */
  async getSessionMemoriesByTags(
    sessionId: string,
    tags: string[]
  ): Promise<MemoryEntry[]> {
    return await this.getSessionMemories(sessionId, { tags })
  }

  /**
   * Get recent session memories
   */
  async getRecentSessionMemories(
    sessionId: string,
    limit: number = 10
  ): Promise<MemoryEntry[]> {
    return await this.getSessionMemories(sessionId, { limit })
  }

  /**
   * Add task to session
   */
  async addSessionTask(sessionId: string, taskId: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Session Memory Manager not initialized')
    }

    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    if (!session.activeTasks.includes(taskId)) {
      session.activeTasks.push(taskId)
      session.lastActivity = new Date()

      // Store task addition in memory
      await this.memoryStore.store({
        content: `Task ${taskId} added to session`,
        metadata: {
          type: 'session_task_added',
          sessionId,
          taskId
        },
        sessionId,
        tags: ['session', 'task'],
        priority: 'medium'
      })

      this.emit('sessionTaskAdded', { sessionId, taskId })
    }
  }

  /**
   * Remove task from session
   */
  async removeSessionTask(sessionId: string, taskId: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Session Memory Manager not initialized')
    }

    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const taskIndex = session.activeTasks.indexOf(taskId)
    if (taskIndex !== -1) {
      session.activeTasks.splice(taskIndex, 1)
      session.lastActivity = new Date()

      // Store task removal in memory
      await this.memoryStore.store({
        content: `Task ${taskId} removed from session`,
        metadata: {
          type: 'session_task_removed',
          sessionId,
          taskId
        },
        sessionId,
        tags: ['session', 'task'],
        priority: 'medium'
      })

      this.emit('sessionTaskRemoved', { sessionId, taskId })
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(sessionId: string): Promise<{
    sessionId: string
    userId: string
    createdAt: Date
    lastActivity: Date
    memoryCount: number
    activeTaskCount: number
    memoryTagCount: number
    sessionDuration: number
  }> {
    if (!this.isInitialized) {
      throw new Error('Session Memory Manager not initialized')
    }

    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const memories = await this.getSessionMemories(sessionId)
    const sessionDuration = Date.now() - session.createdAt.getTime()

    return {
      sessionId,
      userId: session.userId,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      memoryCount: memories.length,
      activeTaskCount: session.activeTasks.length,
      memoryTagCount: session.memoryTags.length,
      sessionDuration
    }
  }

  /**
   * Get all sessions
   */
  getAllSessions(): SessionState[] {
    if (!this.isInitialized) {
      throw new Error('Session Memory Manager not initialized')
    }

    return Array.from(this.sessions.values())
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): SessionState[] {
    if (!this.isInitialized) {
      throw new Error('Session Memory Manager not initialized')
    }

    const now = Date.now()
    const maxAge = this.config.maxSessionDuration

    return Array.from(this.sessions.values()).filter(session => {
      const sessionAge = now - session.lastActivity.getTime()
      return sessionAge < maxAge
    })
  }

  /**
   * Close session
   */
  async closeSession(sessionId: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Session Memory Manager not initialized')
    }

    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    // Store session closure in memory
    await this.memoryStore.store({
      content: `Session closed`,
      metadata: {
        type: 'session_closed',
        sessionId,
        userId: session.userId,
        sessionDuration: Date.now() - session.createdAt.getTime()
      },
      sessionId,
      tags: ['session', 'closure'],
      priority: 'medium'
    })

    this.sessions.delete(sessionId)
    this.emit('sessionClosed', session)
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    if (!this.isInitialized) {
      throw new Error('Session Memory Manager not initialized')
    }

    const now = Date.now()
    const maxAge = this.config.maxSessionDuration
    let cleanedCount = 0

    for (const [sessionId, session] of this.sessions.entries()) {
      const sessionAge = now - session.lastActivity.getTime()
      if (sessionAge > maxAge) {
        await this.closeSession(sessionId)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired sessions`)
    }

    return cleanedCount
  }

  /**
   * Set up automatic cleanup
   */
  private setupAutoCleanup(): void {
    // Clean up expired sessions every 5 minutes
    setInterval(async () => {
      try {
        await this.cleanupExpiredSessions()
      } catch (error) {
        console.error('Error during auto-cleanup:', error)
      }
    }, 5 * 60 * 1000)
  }

  /**
   * Get system statistics
   */
  async getSystemStats(): Promise<{
    totalSessions: number
    activeSessions: number
    totalMemories: number
    isInitialized: boolean
  }> {
    const activeSessions = this.getActiveSessions()
    const memoryStats = await this.memoryStore.getStats()

    return {
      totalSessions: this.sessions.size,
      activeSessions: activeSessions.length,
      totalMemories: memoryStats.totalEntries,
      isInitialized: this.isInitialized
    }
  }

  /**
   * Shutdown the session memory manager
   */
  async shutdown(): Promise<void> {
    try {
      console.log('🔄 Shutting down Session Memory Manager...')

      // Close all active sessions
      for (const sessionId of this.sessions.keys()) {
        await this.closeSession(sessionId)
      }

      this.isInitialized = false
      console.log('✅ Session Memory Manager shutdown complete')
    } catch (error) {
      console.error('❌ Error shutting down Session Memory Manager:', error)
      throw error
    }
  }
} 