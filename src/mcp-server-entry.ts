#!/usr/bin/env node

/**
 * MCP Server Entry Point for Cursor Integration
 * Provides stdio-based MCP server that Cursor can communicate with
 * Implements proper MCP protocol with stdin/stdout communication
 */

import * as readline from 'readline'
import { AgenticAISystem } from './index'
import { getLogger } from './core/logger'

// MCP Protocol Constants
const MCP_PROTOCOL_VERSION = "2024-11-05"
const MCP_SERVER_INFO = {
  name: "AgenticAI-MCP-Server",
  version: "1.0.0",
  capabilities: {
    tools: {},
    resources: {},
    prompts: {}
  }
}

interface MCPRequest {
  jsonrpc: "2.0"
  id: string | number
  method: string
  params?: Record<string, any>
}

interface MCPResponse {
  jsonrpc: "2.0"
  id: string | number
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

class MCPServer {
  private system: AgenticAISystem
  private isInitialized: boolean = false
  private rl: readline.Interface
  private requestCount: number = 0

  constructor() {
    this.system = new AgenticAISystem()
    
    // Set up readline interface for stdin/stdout
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    })
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    getLogger().info('🚀 Starting AgenticAI MCP Server...', {
      module: 'MCPServer',
      operation: 'start'
    })
    
    // Handle each line from stdin
    this.rl.on('line', (line) => {
      this.handleRequest(line)
    })

    // Handle process termination
    process.on('SIGINT', () => {
      getLogger().info('🛑 Received SIGINT, shutting down gracefully...', {
        module: 'MCPServer',
        operation: 'shutdown'
      })
      this.shutdown()
    })

    process.on('SIGTERM', () => {
      getLogger().info('🛑 Received SIGTERM, shutting down gracefully...', {
        module: 'MCPServer',
        operation: 'shutdown'
      })
      this.shutdown()
    })

    getLogger().info('✅ MCP Server ready, waiting for requests...', {
      module: 'MCPServer',
      operation: 'start'
    })
  }

  /**
   * Handle incoming MCP request
   */
  async handleRequest(line: string): Promise<void> {
    this.requestCount++
    const requestId = this.requestCount
    
    try {
      // Parse JSON-RPC request
      const request: MCPRequest = JSON.parse(line)
      getLogger().debug(`📨 [${requestId}] Received request: ${request.method}`, {
        module: 'MCPServer',
        operation: 'handleRequest',
        data: request
      })

      // Validate JSON-RPC 2.0 message format
      if (!request.jsonrpc || request.jsonrpc !== "2.0") {
        this.sendError(request.id || 'unknown', -32600, 'Invalid request: missing or invalid jsonrpc field')
        return
      }

      // Validate request structure
      if (!request.id || !request.method) {
        this.sendError(request.id || 'unknown', -32600, 'Invalid request: missing id or method')
        return
      }

      // Check if server is initialized (except for initialize method)
      if (request.method !== 'initialize' && !this.isInitialized) {
        this.sendError(request.id, -32002, 'Server not initialized')
        return
      }

      // Handle different MCP methods
      let response: MCPResponse

      switch (request.method) {
        case 'initialize':
          response = this.handleInitialize(request)
          break
        case 'tools/list':
          response = await this.handleToolsList(request)
          break
        case 'tools/call':
          response = await this.handleToolCall(request)
          break
        case 'notifications/list':
          response = this.handleNotificationsList(request)
          break
        case 'resources/list':
          response = this.handleResourcesList(request)
          break
        case 'prompts/list':
          response = this.handlePromptsList(request)
          break
        default:
          response = {
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32601, message: `Method not found: ${request.method}` }
          }
      }

      // Send response
      this.sendResponse(response, requestId)

    } catch (error) {
      getLogger().error(`❌ [${requestId}] Error handling request`, {
        module: 'MCPServer',
        operation: 'handleRequest',
        error: error instanceof Error ? error : new Error(String(error))
      })
      this.sendError('unknown', -32700, 'Parse error')
    }
  }

  /**
   * Handle MCP initialization
   */
  handleInitialize(request: MCPRequest): MCPResponse {
    getLogger().info('🔧 Handling initialize request', {
      module: 'MCPServer',
      operation: 'handleInitialize'
    })
    
    // Validate protocol version
    const clientProtocolVersion = request.params?.protocolVersion
    if (clientProtocolVersion && clientProtocolVersion !== MCP_PROTOCOL_VERSION) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32602,
          message: `Unsupported protocol version: ${clientProtocolVersion}. Expected: ${MCP_PROTOCOL_VERSION}`
        }
      }
    }
    
    this.isInitialized = true
    
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: MCP_SERVER_INFO.capabilities,
        serverInfo: MCP_SERVER_INFO
      }
    }
  }

  /**
   * Handle tools list request
   */
  async handleToolsList(request: MCPRequest): Promise<MCPResponse> {
    getLogger().info('🔧 Handling tools/list request', {
      module: 'MCPServer',
      operation: 'handleToolsList'
    })
    
    try {
      // Initialize system if not already done
      if (!this.system.getSystemStatus().isInitialized) {
        getLogger().info('🚀 Initializing AgenticAI System...', {
          module: 'MCPServer',
          operation: 'handleToolsList'
        })
        await this.system.initialize()
      }

      // Get real tool data from MCP server
      const mcpServer = this.system.getMCPServer()
      const registeredTools = mcpServer.getAllTools()
      
      getLogger().debug(`📊 Found ${registeredTools.length} registered tools`, {
        module: 'MCPServer',
        operation: 'handleToolsList',
        data: { toolCount: registeredTools.length }
      })
      
      // Convert to MCP protocol format
      const toolList = registeredTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: {
          type: 'object',
          properties: this.convertParametersToSchema(tool.parameters),
          required: this.getRequiredParameters(tool.parameters)
        }
      }))
      
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: toolList
        }
      }
    } catch (error) {
      getLogger().error('❌ Error getting tool list', {
        module: 'MCPServer',
        operation: 'handleToolsList',
        error: error instanceof Error ? error : new Error(String(error))
      })
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32603,
          message: 'Failed to get tool list',
          data: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  /**
   * Handle tool call request
   */
  async handleToolCall(request: MCPRequest): Promise<MCPResponse> {
    const toolName = request.params?.name
    const toolArgs = request.params?.arguments || {}
    
    getLogger().info(`🔧 Handling tools/call request: ${toolName}`, {
      module: 'MCPServer',
      operation: 'handleToolCall',
      data: { toolName, toolArgs }
    })
    
    if (!toolName) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32602, message: 'Missing tool name' }
      }
    }

    try {
      // Initialize system if not already done
      if (!this.system.getSystemStatus().isInitialized) {
        getLogger().info('🚀 Initializing AgenticAI System...', {
          module: 'MCPServer',
          operation: 'handleToolCall'
        })
        await this.system.initialize()
      }

      const toolResult = await this.system.handleMCPRequest({
        id: request.id.toString(),
        method: toolName,
        params: toolArgs,
        timestamp: Date.now(),
        sessionId: 'default'
      })
      
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify(toolResult, null, 2)
          }]
        }
      }
    } catch (error) {
      getLogger().error(`❌ Tool execution error: ${toolName}`, {
        module: 'MCPServer',
        operation: 'handleToolCall',
        error: error instanceof Error ? error : new Error(String(error))
      })
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32603,
          message: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      }
    }
  }

  /**
   * Handle notifications list request
   */
  handleNotificationsList(request: MCPRequest): MCPResponse {
    getLogger().info('🔧 Handling notifications/list request', {
      module: 'MCPServer',
      operation: 'handleNotificationsList'
    })
    
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        notifications: []
      }
    }
  }

  /**
   * Handle resources list request
   */
  handleResourcesList(request: MCPRequest): MCPResponse {
    getLogger().info('🔧 Handling resources/list request', {
      module: 'MCPServer',
      operation: 'handleResourcesList'
    })
    
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        resources: []
      }
    }
  }

  /**
   * Handle prompts list request
   */
  handlePromptsList(request: MCPRequest): MCPResponse {
    getLogger().info('🔧 Handling prompts/list request', {
      module: 'MCPServer',
      operation: 'handlePromptsList'
    })
    
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        prompts: []
      }
    }
  }

  /**
   * Utility function to automatically inject headless parameter to browser tools
   * Browser tools are identified by having a sessionId parameter
   */
  private injectHeadlessParameter(properties: Record<string, any>): Record<string, any> {
    // Check if this is a browser tool by looking for sessionId parameter
    const isBrowserTool = Object.keys(properties).some(key => key === 'sessionId')
    
    if (isBrowserTool && !properties.hasOwnProperty('headless')) {
      return {
        ...properties,
        headless: { 
          type: 'boolean', 
          description: 'Run browser in headless mode (default: true)',
          default: true
        }
      }
    }
    
    return properties
  }

  /**
   * Convert tool parameters to JSON schema format
   */
  private convertParametersToSchema(parameters: Record<string, any>): Record<string, any> {
    const schema: Record<string, any> = {}
    
    for (const [key, param] of Object.entries(parameters)) {
      schema[key] = {
        type: param.type || 'string',
        description: param.description || '',
        ...(param.enum && { enum: param.enum }),
        ...(param.default !== undefined && { default: param.default })
      }
    }
    
    // Inject headless parameter for browser tools
    return this.injectHeadlessParameter(schema)
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
   * Send JSON-RPC response to stdout
   */
  sendResponse(response: MCPResponse, requestId: number): void {
    const responseLine = JSON.stringify(response)
    console.log(responseLine)
    getLogger().debug(`📤 [${requestId}] Sent response for request ${response.id}`, {
      module: 'MCPServer',
      operation: 'sendResponse'
    })
  }

  /**
   * Send JSON-RPC error response
   */
  sendError(id: string | number, code: number, message: string): void {
    const errorResponse: MCPResponse = {
      jsonrpc: "2.0",
      id,
      error: { code, message }
    }
    this.sendResponse(errorResponse, 0)
  }

  /**
   * Graceful shutdown
   */
  shutdown(): void {
    getLogger().info('🔄 Shutting down MCP Server...', {
      module: 'MCPServer',
      operation: 'shutdown'
    })
    this.rl.close()
    getLogger().info('✅ MCP Server shutdown complete', {
      module: 'MCPServer',
      operation: 'shutdown'
    })
    process.exit(0)
  }
}

// Main execution
async function main() {
  const server = new MCPServer()
  
  try {
    await server.start()
  } catch (error) {
    getLogger().critical('❌ Failed to start MCP Server', {
      module: 'Main',
      operation: 'main',
      error: error instanceof Error ? error : new Error(String(error))
    })
    process.exit(1)
  }
}

// Run main if this is the entry point
if (require.main === module) {
  main()
} 