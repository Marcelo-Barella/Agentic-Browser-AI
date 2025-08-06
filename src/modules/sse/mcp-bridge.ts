import { EventEmitter } from 'events'
import { MCPServer } from '../../core/mcp-server'
import { SSEServer, SSEEvent } from './sse-server'

/**
 * MCP Bridge Module
 * Connects SSE Server to MCP Server for real-time communication
 * Handles bidirectional communication between Cursor and MCP system
 * Implements proper MCP protocol for tool discovery and registration
 */

export interface MCPBridgeConfig {
  enableAutoForwarding: boolean
  enableProgressTracking: boolean
  enableErrorReporting: boolean
  maxRetries: number
  retryDelay: number
}

export interface MCPRequest {
  id: string
  method: string
  params: Record<string, any>
  sessionId: string
  clientId: string
}

export interface MCPResponse {
  id: string
  result?: any
  error?: {
    code: number
    message: string
    details?: any
  }
  sessionId: string
  clientId: string
}

// MCP Protocol message interfaces
export interface MCPToolInfo {
  name: string
  description: string
  inputSchema: {
    type: string
    properties: Record<string, any>
    required: string[]
  }
}

export interface MCPToolRegistration {
  name: string
  description: string
  inputSchema: {
    type: string
    properties: Record<string, any>
    required: string[]
  }
  handler: (params: Record<string, any>) => Promise<any>
}

export class MCPBridge extends EventEmitter {
  private sseServer: SSEServer
  private mcpServer: MCPServer
  private config: MCPBridgeConfig
  private pendingRequests: Map<string, MCPRequest> = new Map()
  private isInitialized: boolean = false

  constructor(
    sseServer: SSEServer,
    mcpServer: MCPServer,
    config: MCPBridgeConfig = {
      enableAutoForwarding: true,
      enableProgressTracking: true,
      enableErrorReporting: true,
      maxRetries: 3,
      retryDelay: 1000
    }
  ) {
    super()
    this.sseServer = sseServer
    this.mcpServer = mcpServer
    this.config = config
  }

  /**
   * Initialize the MCP bridge
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔗 Initializing MCP Bridge...')

      // Set up event listeners
      this.setupEventListeners()

      // Set up SSE event handlers
      this.setupSSEEventHandlers()

      // Set up MCP event handlers
      this.setupMCPEventHandlers()

      this.isInitialized = true
      this.emit('initialized')
      console.log('✅ MCP Bridge initialized successfully')

    } catch (error) {
      console.error('❌ Failed to initialize MCP Bridge:', error)
      throw error
    }
  }

  /**
   * Set up event listeners for the bridge
   */
  private setupEventListeners(): void {
    // Handle SSE client connections
    this.sseServer.on('clientConnected', (clientId: string) => {
      this.handleSSEClientConnected(clientId)
    })

    // Handle SSE client disconnections
    this.sseServer.on('clientDisconnected', (clientId: string) => {
      this.handleSSEClientDisconnected(clientId)
    })

    // Handle SSE client authentication
    this.sseServer.on('clientAuthenticated', (clientId: string, sessionId: string) => {
      this.handleSSEClientAuthenticated(clientId, sessionId)
    })

    // Handle MCP server events
    this.mcpServer.on('toolRegistered', (toolName: string) => {
      this.broadcastToolRegistration(toolName)
    })

    this.mcpServer.on('toolUpdated', (toolName: string) => {
      this.broadcastToolUpdate(toolName)
    })
  }

  /**
   * Set up SSE event handlers
   */
  private setupSSEEventHandlers(): void {
    // Handle incoming MCP requests from SSE clients
    this.sseServer.on('eventSent', (clientId: string, type: string, data: any) => {
      if (type === 'mcp_request') {
        this.handleIncomingMCPRequest(clientId, data)
      }
    })
  }

  /**
   * Set up MCP event handlers
   */
  private setupMCPEventHandlers(): void {
    // Handle MCP server errors
    this.mcpServer.on('error', async (error) => {
      this.broadcastMCPError(error)
    })
  }

  /**
   * Handle SSE client connection
   */
  private handleSSEClientConnected(clientId: string): void {
    console.log(`🔗 SSE client connected to bridge: ${clientId}`)

    // Send bridge connection event with real tool data
    this.sseServer.sendEventToClient(clientId, {
      type: 'bridge_connected',
      data: {
        clientId,
        message: 'Connected to MCP Bridge',
        timestamp: Date.now(),
        availableTools: this.getAvailableTools(),
        mcpInfo: this.mcpServer.getMCPInfo()
      },
      timestamp: Date.now()
    })

    this.emit('clientConnected', clientId)
  }

  /**
   * Handle SSE client disconnection
   */
  private handleSSEClientDisconnected(clientId: string): void {
    console.log(`🔌 SSE client disconnected from bridge: ${clientId}`)

    // Clean up pending requests for this client
    for (const [requestId, request] of this.pendingRequests.entries()) {
      if (request.clientId === clientId) {
        this.pendingRequests.delete(requestId)
      }
    }

    this.emit('clientDisconnected', clientId)
  }

  /**
   * Handle SSE client authentication
   */
  private handleSSEClientAuthenticated(clientId: string, sessionId: string): void {
    console.log(`🔐 SSE client authenticated: ${clientId} -> ${sessionId}`)

    // Send authentication success event
    this.sseServer.sendEventToClient(clientId, {
      type: 'bridge_authenticated',
      data: {
        clientId,
        sessionId,
        message: 'Successfully authenticated with MCP Bridge',
        timestamp: Date.now()
      },
      timestamp: Date.now()
    })

    this.emit('clientAuthenticated', clientId, sessionId)
  }

  /**
   * Handle incoming MCP requests from SSE clients
   */
  private async handleIncomingMCPRequest(clientId: string, data: any): Promise<void> {
    try {
      const request: MCPRequest = {
        id: data.id || `req_${Date.now()}`,
        method: data.method,
        params: data.params || {},
        sessionId: data.sessionId,
        clientId
      }

      console.log(`📨 Incoming MCP request: ${request.method} from ${clientId}`)

      // Store pending request
      this.pendingRequests.set(request.id, request)

      // Send progress event
      this.sseServer.sendEventToClient(clientId, {
        type: 'mcp_progress',
        data: {
          requestId: request.id,
          status: 'processing',
          message: `Processing ${request.method}`,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      })

      // Handle MCP protocol specific requests
      if (request.method === 'tools/list') {
        await this.handleToolDiscoveryRequest(clientId, request)
        return
      }

      // Forward to MCP server for other requests
      const response = await this.mcpServer.handleRequest({
        id: request.id,
        method: request.method,
        params: request.params,
        timestamp: Date.now(),
        sessionId: request.sessionId
      })

      // Create bridge response
      const bridgeResponse: MCPResponse = {
        id: request.id,
        result: response.result,
        sessionId: request.sessionId,
        clientId
      }
      
      if (response.error) {
        bridgeResponse.error = response.error
      }

      // Send response back to client
      this.sseServer.sendEventToClient(clientId, {
        type: 'mcp_response',
        data: bridgeResponse,
        timestamp: Date.now()
      })

      // Clean up pending request
      this.pendingRequests.delete(request.id)

      console.log(`✅ MCP request completed: ${request.method}`)
      this.emit('requestCompleted', request.id, bridgeResponse)

    } catch (error) {
      console.error('❌ Error handling MCP request:', error)

      // Send error response
      this.sseServer.sendEventToClient(clientId, {
        type: 'mcp_error',
        data: {
          requestId: data.id,
          error: {
            code: 500,
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error
          },
          timestamp: Date.now()
        },
        timestamp: Date.now()
      })

      this.emit('requestError', data.id, error)
    }
  }

  /**
   * Handle tool discovery requests (MCP protocol)
   */
  private async handleToolDiscoveryRequest(clientId: string, request: MCPRequest): Promise<void> {
    try {
      console.log(`🔍 Handling tool discovery request from ${clientId}`)

      // Get all registered tools from MCP server
      const registeredTools = this.mcpServer.getAllTools()
      
      // Convert to MCP protocol format
      const toolList: MCPToolInfo[] = registeredTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: {
          type: 'object',
          properties: this.convertParametersToSchema(tool.parameters),
          required: this.getRequiredParameters(tool.parameters)
        }
      }))

      // Send tool discovery response
      this.sseServer.sendEventToClient(clientId, {
        type: 'mcp_response',
        data: {
          id: request.id,
          result: {
            tools: toolList
          },
          sessionId: request.sessionId,
          clientId
        },
        timestamp: Date.now()
      })

      console.log(`✅ Tool discovery completed: ${toolList.length} tools found`)
      this.emit('toolDiscoveryCompleted', clientId, toolList)

    } catch (error) {
      console.error('❌ Error handling tool discovery:', error)
      
      this.sseServer.sendEventToClient(clientId, {
        type: 'mcp_error',
        data: {
          requestId: request.id,
          error: {
            code: 500,
            message: `Tool discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: error
          },
          timestamp: Date.now()
        },
        timestamp: Date.now()
      })
    }
  }

  /**
   * Convert tool parameters to JSON schema format
   */
  private convertParametersToSchema(parameters: Record<string, any>): Record<string, any> {
    const schema: Record<string, any> = {}
    
    for (const [key, param] of Object.entries(parameters)) {
      schema[key] = {
        type: param.type || 'string',
        ...(param.description && { description: param.description }),
        ...(param.enum && { enum: param.enum }),
        ...(param.default !== undefined && { default: param.default })
      }
    }
    
    return schema
  }

  /**
   * Get required parameters from tool parameters
   */
  private getRequiredParameters(parameters: Record<string, any>): string[] {
    return Object.entries(parameters)
      .filter(([_, param]) => param.required === true)
      .map(([key, _]) => key)
  }

  /**
   * Broadcast tool registration to all clients
   */
  private broadcastToolRegistration(toolName: string): void {
    // Get the actual tool data from MCP server
    const registeredTools = this.mcpServer.getAllTools()
    const tool = registeredTools.find(t => t.name === toolName)
    
    if (!tool) {
      console.warn(`⚠️ Tool ${toolName} not found in registry during broadcast`)
      return
    }

    // Create MCP protocol compliant tool registration event
    const toolInfo: MCPToolInfo = {
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object',
        properties: this.convertParametersToSchema(tool.parameters),
        required: this.getRequiredParameters(tool.parameters)
      }
    }

    this.sseServer.broadcastEvent({
      type: 'tool_registered',
      data: {
        tool: toolInfo,
        message: `Tool ${toolName} registered`,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    })

    console.log(`📢 Broadcasted tool registration: ${toolName}`)
  }

  /**
   * Broadcast tool update to all clients
   */
  private broadcastToolUpdate(toolName: string): void {
    // Get the actual tool data from MCP server
    const registeredTools = this.mcpServer.getAllTools()
    const tool = registeredTools.find(t => t.name === toolName)
    
    if (!tool) {
      console.warn(`⚠️ Tool ${toolName} not found in registry during update broadcast`)
      return
    }

    // Create MCP protocol compliant tool update event
    const toolInfo: MCPToolInfo = {
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object',
        properties: this.convertParametersToSchema(tool.parameters),
        required: this.getRequiredParameters(tool.parameters)
      }
    }

    this.sseServer.broadcastEvent({
      type: 'tool_updated',
      data: {
        tool: toolInfo,
        message: `Tool ${toolName} updated`,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    })

    console.log(`📢 Broadcasted tool update: ${toolName}`)
  }

  /**
   * Broadcast MCP error to all clients
   */
  private broadcastMCPError(error: Error): void {
    this.sseServer.broadcastEvent({
      type: 'mcp_error',
      data: {
        error: {
          code: 500,
          message: error.message,
          details: error
        },
        timestamp: Date.now()
      },
      timestamp: Date.now()
    })
  }

  /**
   * Send MCP request to specific client
   */
  sendMCPRequestToClient(clientId: string, request: Omit<MCPRequest, 'clientId'>): void {
    this.sseServer.sendEventToClient(clientId, {
      type: 'mcp_request',
      data: {
        ...request,
        clientId
      },
      timestamp: Date.now()
    })
  }

  /**
   * Send MCP response to specific client
   */
  sendMCPResponseToClient(clientId: string, response: Omit<MCPResponse, 'clientId'>): void {
    this.sseServer.sendEventToClient(clientId, {
      type: 'mcp_response',
      data: {
        ...response,
        clientId
      },
      timestamp: Date.now()
    })
  }

  /**
   * Broadcast MCP event to all clients
   */
  broadcastMCPEvent(event: Omit<SSEEvent, 'id'>): void {
    this.sseServer.broadcastEvent(event)
  }

  /**
   * Broadcast MCP event to clients with specific session
   */
  broadcastMCPEventToSession(sessionId: string, event: Omit<SSEEvent, 'id'>): void {
    this.sseServer.broadcastToSession(sessionId, event)
  }

  /**
   * Get available MCP tools from actual registry
   */
  private getAvailableTools(): MCPToolInfo[] {
    const registeredTools = this.mcpServer.getAllTools()
    
    return registeredTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object',
        properties: this.convertParametersToSchema(tool.parameters),
        required: this.getRequiredParameters(tool.parameters)
      }
    }))
  }

  /**
   * Get bridge status
   */
  getStatus(): {
    isInitialized: boolean
    pendingRequests: number
    connectedClients: number
    enableAutoForwarding: boolean
    enableProgressTracking: boolean
    enableErrorReporting: boolean
    registeredTools: number
  } {
    return {
      isInitialized: this.isInitialized,
      pendingRequests: this.pendingRequests.size,
      connectedClients: this.sseServer.getStatus().activeClients,
      enableAutoForwarding: this.config.enableAutoForwarding,
      enableProgressTracking: this.config.enableProgressTracking,
      enableErrorReporting: this.config.enableErrorReporting,
      registeredTools: this.mcpServer.getAllTools().length
    }
  }

  /**
   * Shutdown the MCP bridge
   */
  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down MCP Bridge...')
    
    // Clean up pending requests
    this.pendingRequests.clear()
    
    this.isInitialized = false
    this.emit('shutdown')
    console.log('✅ MCP Bridge shutdown complete')
  }
} 