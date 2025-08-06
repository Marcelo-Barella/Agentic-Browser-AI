import { EventEmitter } from 'events'
import { randomBytes } from 'crypto'

/**
 * MCP Server Infrastructure
 * Core communication hub for the agentic AI system
 * Handles authentication, request routing, and tool registration
 */

export interface MCPRequest {
  id: string
  method: string
  params: Record<string, any>
  timestamp: number
  sessionId: string
}

export interface MCPResponse {
  id: string
  result?: any
  error?: {
    code: number
    message: string
    details?: any
  }
  timestamp: number
}

export interface MCPTool {
  name: string
  description: string
  parameters: Record<string, any>
  handler: (params: Record<string, any>) => Promise<any>
}

export interface MCPSession {
  id: string
  userId: string
  createdAt: Date
  lastActivity: Date
  permissions: string[]
  isActive: boolean
}

export class MCPServer extends EventEmitter {
  private tools: Map<string, MCPTool> = new Map()
  private sessions: Map<string, MCPSession> = new Map()
  private isInitialized: boolean = false
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _authToken: string

  constructor() {
    super()
    this._authToken = this.generateAuthToken()
  }

  /**
   * Initialize the MCP server
   * Sets up authentication, registers default tools, and starts listening
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔧 Debug: MCP Server initialization started...')
      
      // Generate authentication token
      console.log('🔧 Debug: Generating authentication token...')
      this._authToken = this.generateAuthToken()
      console.log('✅ Debug: Authentication token generated successfully')
      
      // Register default tools
      console.log('🔧 Debug: Registering default tools...')
      await this.registerDefaultTools()
      console.log('✅ Debug: Default tools registered successfully')
      
      // Initialize session management
      console.log('🔧 Debug: Initializing session management...')
      this.initializeSessionManagement()
      console.log('✅ Debug: Session management initialized successfully')
      
      this.isInitialized = true
      this.emit('initialized')
      
      console.log('✅ MCP Server initialized successfully')
      console.log('📊 Debug: MCP Server status after initialization:')
      console.log('   - isInitialized:', this.isInitialized)
      console.log('   - registeredTools:', this.tools.size)
      console.log('   - activeSessions:', this.sessions.size)
    } catch (error) {
      console.error('❌ Failed to initialize MCP Server:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`MCP Server initialization failed: ${errorMessage}`)
    }
  }

  /**
   * Handle incoming MCP requests
   * Validates authentication, routes to appropriate tool, and returns response
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    try {
      console.log(`🔧 Debug: Handling MCP request: ${request.method}`)
      console.log(`📋 Debug: Request details:`, {
        id: request.id,
        method: request.method,
        sessionId: request.sessionId,
        params: request.params
      })
      
      // Log MCP protocol specific information
      console.log(`🔍 Debug: MCP Protocol Info:`)
      console.log(`   - Request ID: ${request.id}`)
      console.log(`   - Method: ${request.method}`)
      console.log(`   - Session ID: ${request.sessionId}`)
      console.log(`   - Timestamp: ${request.timestamp}`)
      console.log(`   - Params: ${JSON.stringify(request.params)}`)
      
      // Validate request structure
      console.log('🔧 Debug: Validating request structure...')
      this.validateRequest(request)
      console.log('✅ Debug: Request validation passed')
      
      // Authenticate session
      console.log('🔧 Debug: Authenticating session...')
      const session = await this.authenticateSession(request.sessionId)
      if (!session) {
        console.log('❌ Debug: Session authentication failed')
        return this.createErrorResponse(request.id, 401, 'Unauthorized session')
      }
      console.log('✅ Debug: Session authenticated successfully')
      
      // Update session activity
      this.updateSessionActivity(request.sessionId)
      
      // Route to appropriate tool
      console.log(`🔧 Debug: Looking for tool: ${request.method}`)
      const tool = this.tools.get(request.method)
      if (!tool) {
        console.log(`❌ Debug: Tool not found: ${request.method}`)
        console.log(`📋 Debug: Available tools:`, Array.from(this.tools.keys()))
        return this.createErrorResponse(request.id, 404, `Tool '${request.method}' not found`)
      }
      console.log(`✅ Debug: Tool found: ${request.method}`)
      
      // Execute tool handler
      console.log('🔧 Debug: Executing tool handler...')
      const result = await tool.handler(request.params)
      console.log('✅ Debug: Tool handler executed successfully')
      
      return {
        id: request.id,
        result,
        timestamp: Date.now()
      }
    } catch (error) {
      console.error('❌ Error handling MCP request:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return this.createErrorResponse(request.id, 500, `Internal server error: ${errorMessage}`)
    }
  }

  /**
   * Register a new tool with the MCP server
   */
  async registerTool(tool: MCPTool): Promise<void> {
    console.log(`🔧 Debug: Registering tool: ${tool.name}`)
    console.log(`📋 Debug: Tool details:`, {
      name: tool.name,
      description: tool.description,
      parameters: Object.keys(tool.parameters),
      isUpdate: this.tools.has(tool.name)
    })
    
    const isUpdate = this.tools.has(tool.name)
    this.tools.set(tool.name, tool)
    
    if (isUpdate) {
      console.log(`🔄 Debug: Tool updated: ${tool.name}`)
      this.emit('toolUpdated', tool.name)
    } else {
      console.log(`✅ Debug: Tool registered: ${tool.name}`)
      this.emit('toolRegistered', tool.name)
    }
    
    console.log(`📊 Debug: Total tools after registration: ${this.tools.size}`)
  }

  /**
   * Register default tools for the agentic AI system
   */
  private async registerDefaultTools(): Promise<void> {
    const defaultTools: MCPTool[] = [
      {
        name: 'project.analyze',
        description: 'Analyze Nuxt.js project structure',
        parameters: {
          projectPath: { type: 'string', required: true }
        },
        handler: async (_params) => {
          // Will be implemented by Project Analysis Module
          return { status: 'pending', message: 'Project analysis tool not yet implemented' }
        }
      },
      {
        name: 'filesystem.read',
        description: 'Read file from filesystem',
        parameters: {
          path: { type: 'string', required: true }
        },
        handler: async (_params) => {
          // Will be implemented by Filesystem Integration Module
          return { status: 'pending', message: 'Filesystem tool not yet implemented' }
        }
      },
      {
        name: 'browser.inspect',
        description: 'Inspect live application through Chrome DevTools',
        parameters: {
          url: { type: 'string', required: true }
        },
        handler: async (_params) => {
          // Will be implemented by Browser Integration Module
          return { status: 'pending', message: 'Browser inspection tool not yet implemented' }
        }
      }
    ]

    for (const tool of defaultTools) {
      await this.registerTool(tool)
    }
  }

  /**
   * Generate secure authentication token
   */
  private generateAuthToken(): string {
    return randomBytes(32).toString('hex')
  }

  /**
   * Validate incoming request structure
   */
  private validateRequest(request: MCPRequest): void {
    if (!request.id || !request.method || !request.sessionId) {
      throw new Error('Invalid request structure: missing required fields')
    }
    
    if (typeof request.params !== 'object') {
      throw new Error('Invalid request structure: params must be an object')
    }
  }

  /**
   * Authenticate session and check permissions
   */
  private async authenticateSession(sessionId: string): Promise<MCPSession | null> {
    const session = this.sessions.get(sessionId)
    
    if (!session || !session.isActive) {
      return null
    }
    
    // Check if session has expired (30 minutes)
    const now = new Date()
    const sessionAge = now.getTime() - session.lastActivity.getTime()
    if (sessionAge > 30 * 60 * 1000) {
      session.isActive = false
      this.sessions.delete(sessionId)
      return null
    }
    
    return session
  }

  /**
   * Update session activity timestamp
   */
  private updateSessionActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.lastActivity = new Date()
    }
  }

  /**
   * Create error response
   */
  private createErrorResponse(id: string, code: number, message: string): MCPResponse {
    return {
      id,
      error: {
        code,
        message
      },
      timestamp: Date.now()
    }
  }

  /**
   * Initialize session management
   */
  private initializeSessionManagement(): void {
    // Clean up expired sessions every 5 minutes
    setInterval(() => {
      const now = new Date()
      for (const [sessionId, session] of this.sessions.entries()) {
        const sessionAge = now.getTime() - session.lastActivity.getTime()
        if (sessionAge > 30 * 60 * 1000) {
          this.sessions.delete(sessionId)
        }
      }
    }, 5 * 60 * 1000)
  }

  /**
   * Create a new session
   */
  createSession(userId: string, permissions: string[] = []): MCPSession {
    const sessionId = randomBytes(16).toString('hex')
    const session: MCPSession = {
      id: sessionId,
      userId,
      createdAt: new Date(),
      lastActivity: new Date(),
      permissions,
      isActive: true
    }
    
    this.sessions.set(sessionId, session)
    return session
  }

  /**
   * Get server status
   */
  getStatus(): { isInitialized: boolean; activeSessions: number; registeredTools: number } {
    return {
      isInitialized: this.isInitialized,
      activeSessions: this.sessions.size,
      registeredTools: this.tools.size
    }
  }

  /**
   * Get all registered tools
   */
  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values())
  }

  /**
   * Check if the server is initialized
   */
  isReady(): boolean {
    return this.isInitialized
  }

  /**
   * Get MCP server information for Cursor integration
   */
  getMCPInfo(): {
    serverName: string
    version: string
    capabilities: string[]
    tools: string[]
    connectionInfo: {
      type: 'sse' | 'tcp' | 'websocket'
      port?: number
      endpoint?: string
    }
  } {
    return {
      serverName: 'AgenticAI-MCP-Server',
      version: '1.0.0',
      capabilities: ['tools', 'resources', 'prompts'],
      tools: Array.from(this.tools.keys()),
      connectionInfo: {
        type: 'sse',
        port: 3003,
        endpoint: '/events'
      }
    }
  }

  /**
   * Shutdown the MCP server
   */
  async shutdown(): Promise<void> {
    this.isInitialized = false
    this.sessions.clear()
    this.tools.clear()
    this.emit('shutdown')
  }
} 