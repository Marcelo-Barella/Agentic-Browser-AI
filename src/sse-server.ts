#!/usr/bin/env node

/**
 * SSE Server for Real-time Communication
 * Provides Server-Sent Events endpoint for real-time MCP communication
 * Can be started independently from the stdio MCP server
 */

import express, { Request, Response } from 'express'
import cors from 'cors'
import { AgenticAISystem } from './index.js'
import { getLogger } from './core/logger.js'

// MCP Protocol Constants
const MCP_PROTOCOL_VERSION = "2024-11-05"
const MCP_SERVER_INFO = {
  name: "AgenticAI-SSE-Server",
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

class SSEServer {
  private app: express.Application
  private system: AgenticAISystem
  private isInitialized: boolean = false
  private clients: Map<string, Response> = new Map()

  constructor() {
    this.app = express()
    this.system = new AgenticAISystem()
    this.setupMiddleware()
    this.setupRoutes()
  }

  private setupMiddleware(): void {
    this.app.use(cors({
      origin: '*',
      credentials: true
    }))
    this.app.use(express.json({ limit: '10mb' }))
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        initialized: this.isInitialized,
        activeClients: this.clients.size,
        serverInfo: MCP_SERVER_INFO
      })
    })

    // SSE endpoint for real-time communication
    this.app.get('/events', (req: Request, res: Response) => {
      this.handleSSEConnection(req, res)
    })

    // MCP protocol endpoint
    this.app.post('/', async (req: Request, res: Response) => {
      await this.handleMCPRequest(req, res)
    })

    // Status endpoint
    this.app.get('/status', (req: Request, res: Response) => {
      res.json({
        server: MCP_SERVER_INFO,
        system: this.system.getSystemStatus(),
        clients: this.clients.size
      })
    })
  }

  private handleSSEConnection(req: Request, res: Response): void {
    getLogger().info('🔗 New SSE client connecting...', {
      module: 'SSEServer',
      operation: 'handleSSEConnection'
    })
    
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true'
    })
    res.flushHeaders()
    
    const clientId = Math.random().toString(36).substring(2)
    this.clients.set(clientId, res)
    
    // Send initial connection event
    const welcomeEvent = {
      event: 'mcp_welcome',
      data: {
        clientId,
        serverInfo: MCP_SERVER_INFO,
        message: 'Connected to AgenticAI SSE Server',
        timestamp: Date.now()
      }
    }
    
    res.write(`event: ${welcomeEvent.event}\ndata: ${JSON.stringify(welcomeEvent.data)}\n\n`)
    
    getLogger().info(`✅ SSE client connected: ${clientId}`, {
      module: 'SSEServer',
      operation: 'handleSSEConnection',
      data: { clientId, totalClients: this.clients.size }
    })
    
    req.on('close', () => { 
      getLogger().info(`🔌 SSE client disconnected: ${clientId}`, {
        module: 'SSEServer',
        operation: 'handleSSEConnection'
      })
      this.clients.delete(clientId)
    })
    
    req.on('error', (error) => {
      getLogger().error('SSE connection error', {
        module: 'SSEServer',
        operation: 'handleSSEConnection',
        error: error instanceof Error ? error : new Error(String(error))
      })
      this.clients.delete(clientId)
    })
  }

  private async handleMCPRequest(req: Request, res: Response): Promise<void> {
    getLogger().debug('📨 Received MCP request', {
      module: 'SSEServer',
      operation: 'handleMCPRequest',
      data: req.body
    })
    
    if (!this.isInitialized) {
      getLogger().info('🚀 Initializing AgenticAI System...', {
        module: 'SSEServer',
        operation: 'handleMCPRequest'
      })
      try {
        await this.system.initialize()
        this.isInitialized = true
        getLogger().info('✅ System initialized successfully', {
          module: 'SSEServer',
          operation: 'handleMCPRequest'
        })
      } catch (error) {
        getLogger().error('❌ Failed to initialize system', {
          module: 'SSEServer',
          operation: 'handleMCPRequest',
          error: error instanceof Error ? error : new Error(String(error))
        })
        const response: MCPResponse = {
          jsonrpc: "2.0",
          id: req.body.id,
          error: { 
            code: -32603, 
            message: 'System initialization failed',
            data: error instanceof Error ? error.message : 'Unknown error'
          }
        }
        res.status(500).json(response)
        return
      }
    }
    
    const mcpRequest: MCPRequest = req.body
    
    if (!mcpRequest.id || !mcpRequest.method) {
      const response: MCPResponse = {
        jsonrpc: "2.0",
        id: mcpRequest.id || 'unknown',
        error: { code: -32600, message: 'Invalid request: missing id or method' }
      }
      res.status(400).json(response)
      return
    }
    
    let result: any = null
    let error: any = null
    
    try {
      if (mcpRequest.method === 'initialize') {
        // Handle MCP initialization
        result = {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: MCP_SERVER_INFO.capabilities,
          serverInfo: MCP_SERVER_INFO
        }
      } else if (mcpRequest.method === 'tools/list') {
        getLogger().info('🔧 Getting tool list...', {
          module: 'SSEServer',
          operation: 'handleMCPRequest'
        })
        
        // Get real tool data from MCP server
        const mcpServer = this.system.getMCPServer()
        const registeredTools = mcpServer.getAllTools()
        
        getLogger().debug(`📊 Found ${registeredTools.length} registered tools`, {
          module: 'SSEServer',
          operation: 'handleMCPRequest',
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
        
        result = {
          tools: toolList
        }
        
        getLogger().info(`✅ Tool list sent with ${toolList.length} tools`, {
          module: 'SSEServer',
          operation: 'handleMCPRequest'
        })
      } else if (mcpRequest.method === 'tools/call') {
        getLogger().info(`🔧 Calling tool: ${mcpRequest.params?.name}`, {
          module: 'SSEServer',
          operation: 'handleMCPRequest',
          data: { toolName: mcpRequest.params?.name }
        })
        
        const toolName = mcpRequest.params?.name
        const toolParams = mcpRequest.params?.arguments || {}
        
        if (!toolName) {
          error = { code: -32602, message: 'Missing tool name' }
        } else {
          const toolResult = await this.system.handleMCPRequest({
            id: mcpRequest.id.toString(),
            method: toolName,
            params: toolParams,
            timestamp: Date.now(),
            sessionId: 'default'
          })
          
          result = { 
            content: [{ 
              type: 'text', 
              text: JSON.stringify(toolResult, null, 2) 
            }] 
          }
          
          getLogger().info(`✅ Tool call completed: ${toolName}`, {
            module: 'SSEServer',
            operation: 'handleMCPRequest'
          })
        }
      } else {
        error = { code: -32601, message: `Method not found: ${mcpRequest.method}` }
        getLogger().warn(`⚠️ Unknown method: ${mcpRequest.method}`, {
          module: 'SSEServer',
          operation: 'handleMCPRequest'
        })
      }
    } catch (err: any) {
      error = { code: -32603, message: err.message }
      getLogger().error('❌ Error processing request', {
        module: 'SSEServer',
        operation: 'handleMCPRequest',
        error: err instanceof Error ? err : new Error(String(err))
      })
    }
    
    const response: MCPResponse = error
      ? { jsonrpc: "2.0", id: mcpRequest.id, error }
      : { jsonrpc: "2.0", id: mcpRequest.id, result }
    
    // Send response via SSE to all connected clients
    if (this.clients.size > 0) {
      try {
        const sseData = `event: mcp_response\ndata: ${JSON.stringify(response)}\n\n`
        for (const [clientId, clientRes] of this.clients) {
          clientRes.write(sseData)
        }
        getLogger().debug(`📤 Sent response to ${this.clients.size} SSE clients`, {
          module: 'SSEServer',
          operation: 'handleMCPRequest'
        })
      } catch (err) {
        getLogger().error('❌ Failed to send SSE response', {
          module: 'SSEServer',
          operation: 'handleMCPRequest',
          error: err instanceof Error ? err : new Error(String(err))
        })
      }
    }
    
    // Send HTTP response
    res.json(response)
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
   * Start the SSE server
   */
  async start(): Promise<void> {
    const port = 3003
    this.app.listen(port, () => {
      getLogger().info(`✅ AgenticAI SSE Server running on port ${port}`, {
        module: 'SSEServer',
        operation: 'start'
      })
      getLogger().info(`🔗 SSE endpoint: http://localhost:${port}/events`, {
        module: 'SSEServer',
        operation: 'start'
      })
      getLogger().info(`📊 Health check: http://localhost:${port}/health`, {
        module: 'SSEServer',
        operation: 'start'
      })
      getLogger().info(`📈 Status: http://localhost:${port}/status`, {
        module: 'SSEServer',
        operation: 'start'
      })
      getLogger().info('🎯 Ready for real-time MCP communication', {
        module: 'SSEServer',
        operation: 'start'
      })
    })
  }

  /**
   * Get server status
   */
  getStatus(): {
    isInitialized: boolean
    port: number
    activeClients: number
    serverName: string
    serverVersion: string
  } {
    return {
      isInitialized: this.isInitialized,
      port: 3003,
      activeClients: this.clients.size,
      serverName: MCP_SERVER_INFO.name,
      serverVersion: MCP_SERVER_INFO.version
    }
  }

  /**
   * Shutdown the server
   */
  async shutdown(): Promise<void> {
    getLogger().info('🛑 Shutting down SSE Server...', {
      module: 'SSEServer',
      operation: 'shutdown'
    })
    
    // Close all client connections
    for (const [clientId, clientRes] of this.clients) {
      try {
        clientRes.end()
        getLogger().debug(`Closed connection for client: ${clientId}`, {
          module: 'SSEServer',
          operation: 'shutdown'
        })
      } catch (error) {
        getLogger().error(`Error closing connection for client ${clientId}`, {
          module: 'SSEServer',
          operation: 'shutdown',
          error: error instanceof Error ? error : new Error(String(error))
        })
      }
    }

    this.clients.clear()
    this.isInitialized = false
    
    getLogger().info('✅ SSE Server shutdown complete', {
      module: 'SSEServer',
      operation: 'shutdown'
    })
  }
}

// Main execution
async function main() {
  const server = new SSEServer()
  
  try {
    await server.start()
    
    // Keep the server running
    process.on('SIGINT', async () => {
      getLogger().info('\n🛑 Received SIGINT, shutting down...', {
        module: 'Main',
        operation: 'signalHandler'
      })
      await server.shutdown()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      getLogger().info('\n🛑 Received SIGTERM, shutting down...', {
        module: 'Main',
        operation: 'signalHandler'
      })
      await server.shutdown()
      process.exit(0)
    })
    
  } catch (error) {
    getLogger().critical('❌ Failed to start SSE Server', {
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