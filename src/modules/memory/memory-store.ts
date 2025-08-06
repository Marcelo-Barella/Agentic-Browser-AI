/**
 * Memory Store - Phase 4
 * Handles vector database integration for memory storage and retrieval
 * Supports Pinecone and Weaviate as vector database providers
 */

import { EventEmitter } from 'events'

export interface MemoryEntry {
  id: string
  content: string
  metadata: Record<string, any>
  vector?: number[]
  timestamp: Date
  sessionId?: string
  tags?: string[]
  priority: 'low' | 'medium' | 'high'
}

export interface MemoryQuery {
  content?: string
  metadata?: Record<string, any>
  sessionId?: string
  tags?: string[]
  limit?: number
  similarity?: number
}

export interface MemorySearchResult {
  entry: MemoryEntry
  similarity: number
  score: number
}

export interface VectorDatabaseConfig {
  provider: 'pinecone' | 'weaviate' | 'local'
  apiKey?: string
  environment?: string
  indexName?: string
  dimensions?: number
  metric?: 'cosine' | 'euclidean' | 'dotproduct'
}

export class MemoryStore extends EventEmitter {
  private config: VectorDatabaseConfig
  private isInitialized = false
  private localStorage: Map<string, MemoryEntry> = new Map()

  constructor(config: VectorDatabaseConfig) {
    super()
    this.config = config
  }

  /**
   * Initialize the memory store
   */
  async initialize(): Promise<void> {
    try {
      console.log('🧠 Initializing Memory Store...')

      if (this.config.provider === 'local') {
        // Use local storage for development/testing
        this.isInitialized = true
        console.log('✅ Memory Store initialized (local mode)')
      } else {
        // Initialize external vector database
        await this.initializeVectorDatabase()
        this.isInitialized = true
        console.log('✅ Memory Store initialized')
      }

      this.emit('initialized')
    } catch (error) {
      console.error('❌ Failed to initialize Memory Store:', error)
      throw error
    }
  }

  /**
   * Store a memory entry
   */
  async store(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Memory Store not initialized')
    }

    const id = this.generateId()
    const timestamp = new Date()
    
    const memoryEntry: MemoryEntry = {
      ...entry,
      id,
      timestamp
    }

    // Generate vector embedding if not provided
    if (!memoryEntry.vector) {
      memoryEntry.vector = await this.generateEmbedding(memoryEntry.content)
    }

    if (this.config.provider === 'local') {
      this.localStorage.set(id, memoryEntry)
    } else {
      await this.storeInVectorDatabase(memoryEntry)
    }

    this.emit('entryStored', memoryEntry)
    return id
  }

  /**
   * Retrieve a memory entry by ID
   */
  async retrieve(id: string): Promise<MemoryEntry | null> {
    if (!this.isInitialized) {
      throw new Error('Memory Store not initialized')
    }

    if (this.config.provider === 'local') {
      return this.localStorage.get(id) || null
    } else {
      return await this.retrieveFromVectorDatabase(id)
    }
  }

  /**
   * Search memory entries by similarity
   */
  async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    if (!this.isInitialized) {
      throw new Error('Memory Store not initialized')
    }

    if (this.config.provider === 'local') {
      return this.searchLocal(query)
    } else {
      return await this.searchVectorDatabase(query)
    }
  }

  /**
   * Delete a memory entry
   */
  async delete(id: string): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('Memory Store not initialized')
    }

    if (this.config.provider === 'local') {
      const deleted = this.localStorage.delete(id)
      if (deleted) {
        this.emit('entryDeleted', id)
      }
      return deleted
    } else {
      return await this.deleteFromVectorDatabase(id)
    }
  }

  /**
   * List memory entries with filtering
   */
  async list(query: MemoryQuery = {}): Promise<MemoryEntry[]> {
    if (!this.isInitialized) {
      throw new Error('Memory Store not initialized')
    }

    if (this.config.provider === 'local') {
      return this.listLocal(query)
    } else {
      return await this.listFromVectorDatabase(query)
    }
  }

  /**
   * Get memory store statistics
   */
  async getStats(): Promise<{
    totalEntries: number
    provider: string
    isInitialized: boolean
    lastActivity: Date
  }> {
    const totalEntries = this.config.provider === 'local' 
      ? this.localStorage.size 
      : await this.getVectorDatabaseStats()

    return {
      totalEntries,
      provider: this.config.provider,
      isInitialized: this.isInitialized,
      lastActivity: new Date()
    }
  }

  /**
   * Initialize vector database connection
   */
  private async initializeVectorDatabase(): Promise<void> {
    // TODO: Implement Pinecone/Weaviate initialization
    // This is a placeholder for the actual implementation
    console.log(`🔗 Initializing ${this.config.provider} vector database...`)
    
    // Simulate initialization delay
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  /**
   * Generate embedding for text content
   */
  private async generateEmbedding(content: string): Promise<number[]> {
    // TODO: Implement actual embedding generation
    // This is a placeholder that generates a simple hash-based vector
    const hash = this.simpleHash(content)
    const vector = new Array(1536).fill(0)
    
    for (let i = 0; i < Math.min(hash.length, vector.length); i++) {
      vector[i] = (hash.charCodeAt(i) % 256) / 256
    }
    
    return vector
  }

  /**
   * Store entry in vector database
   */
  private async storeInVectorDatabase(entry: MemoryEntry): Promise<void> {
    // TODO: Implement actual vector database storage
    console.log(`📝 Storing entry ${entry.id} in ${this.config.provider}`)
  }

  /**
   * Retrieve entry from vector database
   */
  private async retrieveFromVectorDatabase(id: string): Promise<MemoryEntry | null> {
    // TODO: Implement actual vector database retrieval
    console.log(`🔍 Retrieving entry ${id} from ${this.config.provider}`)
    return null
  }

  /**
   * Search vector database
   */
  private async searchVectorDatabase(query: MemoryQuery): Promise<MemorySearchResult[]> {
    // TODO: Implement actual vector database search
    console.log(`🔍 Searching ${this.config.provider} with query:`, query)
    return []
  }

  /**
   * Delete from vector database
   */
  private async deleteFromVectorDatabase(id: string): Promise<boolean> {
    // TODO: Implement actual vector database deletion
    console.log(`🗑️ Deleting entry ${id} from ${this.config.provider}`)
    return true
  }

  /**
   * List from vector database
   */
  private async listFromVectorDatabase(query: MemoryQuery): Promise<MemoryEntry[]> {
    // TODO: Implement actual vector database listing
    console.log(`📋 Listing entries from ${this.config.provider}`)
    return []
  }

  /**
   * Get vector database statistics
   */
  private async getVectorDatabaseStats(): Promise<number> {
    // TODO: Implement actual vector database stats
    return 0
  }

  /**
   * Search local storage
   */
  private searchLocal(query: MemoryQuery): MemorySearchResult[] {
    const results: MemorySearchResult[] = []
    
    for (const entry of this.localStorage.values()) {
      let match = true
      
      // Filter by session ID
      if (query.sessionId && entry.sessionId !== query.sessionId) {
        match = false
      }
      
      // Filter by tags
      if (query.tags && entry.tags) {
        const hasAllTags = query.tags.every(tag => entry.tags!.includes(tag))
        if (!hasAllTags) {
          match = false
        }
      }
      
      // Filter by metadata
      if (query.metadata && entry.metadata) {
        for (const [key, value] of Object.entries(query.metadata)) {
          if (entry.metadata[key] !== value) {
            match = false
            break
          }
        }
      }
      
      if (match) {
        // Calculate similarity if content query provided
        let similarity = 1.0
        if (query.content) {
          similarity = this.calculateSimilarity(query.content, entry.content)
        }
        
        if (similarity >= (query.similarity || 0)) {
          results.push({
            entry,
            similarity,
            score: similarity
          })
        }
      }
    }
    
    // Sort by similarity/score
    results.sort((a, b) => b.score - a.score)
    
    // Apply limit
    if (query.limit) {
      results.splice(query.limit)
    }
    
    return results
  }

  /**
   * List local storage entries
   */
  private listLocal(query: MemoryQuery): MemoryEntry[] {
    const results: MemoryEntry[] = []
    
    for (const entry of this.localStorage.values()) {
      let match = true
      
      // Apply filters
      if (query.sessionId && entry.sessionId !== query.sessionId) {
        match = false
      }
      
      if (query.tags && entry.tags) {
        const hasAllTags = query.tags.every(tag => entry.tags!.includes(tag))
        if (!hasAllTags) {
          match = false
        }
      }
      
      if (query.metadata && entry.metadata) {
        for (const [key, value] of Object.entries(query.metadata)) {
          if (entry.metadata[key] !== value) {
            match = false
            break
          }
        }
      }
      
      if (match) {
        results.push(entry)
      }
    }
    
    // Sort by timestamp (newest first)
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    
    // Apply limit
    if (query.limit) {
      results.splice(query.limit)
    }
    
    return results
  }

  /**
   * Calculate similarity between two text strings
   */
  private calculateSimilarity(text1: string, text2: string): number {
    // Simple Jaccard similarity implementation
    const words1 = new Set(text1.toLowerCase().split(/\s+/))
    const words2 = new Set(text2.toLowerCase().split(/\s+/))
    
    const intersection = new Set([...words1].filter(x => words2.has(x)))
    const union = new Set([...words1, ...words2])
    
    return intersection.size / union.size
  }

  /**
   * Generate unique ID for memory entries
   */
  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Simple hash function for placeholder embedding generation
   */
  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString()
  }

  /**
   * Shutdown the memory store
   */
  async shutdown(): Promise<void> {
    try {
      console.log('🔄 Shutting down Memory Store...')
      
      if (this.config.provider !== 'local') {
        // TODO: Implement vector database cleanup
        console.log(`🔗 Disconnecting from ${this.config.provider}`)
      }
      
      this.isInitialized = false
      console.log('✅ Memory Store shutdown complete')
    } catch (error) {
      console.error('❌ Error shutting down Memory Store:', error)
      throw error
    }
  }
} 