#!/usr/bin/env node

/**
 * MCP Server for Cursor Integration
 * Addresses timeout issues with faster response times
 */

import * as readline from 'readline'
import * as fs from 'fs/promises'
import * as path from 'path'
import { getLogger } from './core/logger.js'

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

interface MCPNotification {
  jsonrpc: "2.0"
  method: string
  params?: Record<string, any>
}

class MCPServer {
  private rl: readline.Interface
  private isInitialized: boolean = false
  private requestCount: number = 0
  private debugMode: boolean
  private logger: any
  private logFilePath: string

  constructor() {
    this.debugMode = process.env.DEBUG_MCP === 'true'
    
    // Initialize main logger
    this.logger = getLogger()
    
    // Set up readline interface for stdin/stdout
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    })
  }

  /**
   * Initialize logger with minimal overhead
   */
  private async initializeLogger(): Promise<void> {
    try {
      // Create logs directory if it doesn't exist
      const logsDir = 'logs'
      try {
        await fs.access(logsDir)
      } catch {
        await fs.mkdir(logsDir, { recursive: true })
      }

      // Create log file
      const date = new Date()
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const logFileName = `log_${year}-${month}-${day}.log`
      this.logFilePath = path.join(logsDir, logFileName)

      // Ensure log file exists
      try {
        await fs.access(this.logFilePath)
      } catch {
        await fs.writeFile(this.logFilePath, '', 'utf8')
      }

      this.logger.info('Logger initialized for MCP Server', {
        module: 'MCPServer',
        operation: 'initializeLogger',
        data: {
          debugMode: this.debugMode,
          logFilePath: this.logFilePath
        }
      })
    } catch (error) {
      this.logger.error('Failed to initialize logger', {
        module: 'MCPServer',
        operation: 'initializeLogger',
        error: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Start the MCP server with optimized startup
   */
  async start(): Promise<void> {
    try {
      await this.initializeLogger()
      
      this.logger.info('🚀 Starting AgenticAI MCP Server...', {
        module: 'MCPServer',
        operation: 'start'
      })
      this.logger.debug(`📊 Debug mode: ${this.debugMode ? 'enabled' : 'disabled'}`, {
        module: 'MCPServer',
        operation: 'start'
      })
      
      // Send initial notification immediately
      this.sendInitialNotification()
      
      this.logger.info('✅ MCP Server ready, waiting for requests...', {
        module: 'MCPServer',
        operation: 'start'
      })
      
      // Set up request handler
      this.rl.on('line', (line) => {
        this.handleRequest(line).catch(error => {
          this.logger.error('Failed to handle request', {
            module: 'MCPServer',
            operation: 'handleRequest',
            error: error instanceof Error ? error : new Error(String(error))
          })
        })
      })
      
      // Handle shutdown gracefully
      process.on('SIGINT', () => this.shutdown())
      process.on('SIGTERM', () => this.shutdown())
      
      // Handle uncaught exceptions
      process.on('uncaughtException', (error) => {
        this.logger.critical('Uncaught exception', {
          module: 'MCPServer',
          operation: 'uncaughtException',
          error: error instanceof Error ? error : new Error(String(error))
        })
        this.shutdown()
      })
      
      process.on('unhandledRejection', (reason, promise) => {
        this.logger.critical('Unhandled promise rejection', {
          module: 'MCPServer',
          operation: 'unhandledRejection',
          error: reason instanceof Error ? reason : new Error(String(reason)),
          data: { promise: promise.toString() }
        })
        this.shutdown()
      })
      
    } catch (error) {
      this.logger.critical('Failed to start MCP Server', {
        module: 'MCPServer',
        operation: 'start',
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw error
    }
  }

  /**
   * Send initial notification immediately on startup
   */
  private sendInitialNotification(): void {
    try {
      const notification: MCPNotification = {
        jsonrpc: "2.0",
        method: "notifications/list",
        params: {
          notifications: []
        }
      }
      
      console.log(JSON.stringify(notification))
      this.logger.info('📤 Sent initial server info notification', {
        module: 'MCPServer',
        operation: 'sendInitialNotification'
      })
    } catch (error) {
      this.logger.error('Failed to send initial notification', {
        module: 'MCPServer',
        operation: 'sendInitialNotification',
        error: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Handle incoming requests with optimized response times
   */
  async handleRequest(line: string): Promise<void> {
    if (!line.trim()) return
    
    this.requestCount++
    const requestId = this.requestCount
    
    try {
      const request: MCPRequest = JSON.parse(line)
      this.logger.debug(`📨 [${requestId}] Received request: ${request.method}`, {
        module: 'MCPServer',
        operation: 'handleRequest',
        data: {
          requestId,
          method: request.method,
          id: request.id,
          params: request.params
        }
      })
      
      let response: MCPResponse
      
      // Handle different request types with minimal processing
      switch (request.method) {
        case 'initialize':
          response = this.handleInitialize(request)
          break
        case 'tools/list':
          response = this.handleToolsList(request)
          break
        case 'tools/call':
          response = await this.handleToolCall(request)
          break
        case 'prompts/list':
          response = this.handlePromptsList(request)
          break
        case 'resources/list':
          response = this.handleResourcesList(request)
          break
        case 'notifications/list':
          response = this.handleNotificationsList(request)
          break
        default:
          this.logger.warn(`Unknown method: ${request.method}`, {
            module: 'MCPServer',
            operation: 'handleRequest',
            data: { method: request.method, requestId }
          })
          response = {
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32601, message: `Method not found: ${request.method}` }
          }
      }
      
      this.sendResponse(response, requestId)
      
    } catch (error) {
      this.logger.error(`Failed to process request: ${error}`, {
        module: 'MCPServer',
        operation: 'handleRequest',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { requestId, line: line.substring(0, 100) }
      })
      this.sendError(request.id || requestId, -32700, 'Parse error')
    }
  }

  /**
   * Handle initialize request with optimized response
   */
  handleInitialize(request: MCPRequest): MCPResponse {
    this.logger.info('🔧 Handling initialize request', {
      module: 'MCPServer',
      operation: 'handleInitialize',
      data: { requestId: request.id }
    })
    
    this.isInitialized = true
    
    const response = {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        },
        serverInfo: MCP_SERVER_INFO
      }
    }
    
    this.logger.info('✅ Initialize request handled successfully', {
      module: 'MCPServer',
      operation: 'handleInitialize',
      data: { requestId: request.id }
    })
    
    return response
  }

  /**
   * Handle tools/list request with pre-defined tools for speed
   */
  handleToolsList(request: MCPRequest): MCPResponse {
    this.logger.info('🔧 Handling tools/list request', {
      module: 'MCPServer',
      operation: 'handleToolsList',
      data: { requestId: request.id }
    })
    
    // Pre-define tools for faster response
    const tools = [
      {
        name: "filesystem.read",
        description: "Read file content from filesystem",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the file to read"
            }
          },
          required: ["path"]
        }
      },
      {
        name: "filesystem.write",
        description: "Write content to filesystem",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the file to write"
            },
            content: {
              type: "string",
              description: "Content to write to the file"
            }
          },
          required: ["path", "content"]
        }
      },
      {
        name: "filesystem.list",
        description: "List directory contents",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the directory to list"
            }
          },
          required: ["path"]
        }
      },
      {
        name: "system.info",
        description: "Get system information and capabilities",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "mcp.status",
        description: "Get MCP server status and connection info",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      }
    ]
    
    const response = {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        tools: tools
      }
    }
    
    this.logger.info('✅ Tools list request handled successfully', {
      module: 'MCPServer',
      operation: 'handleToolsList',
      data: { 
        requestId: request.id,
        toolCount: tools.length
      }
    })
    
    return response
  }

  /**
   * Handle tool call request with optimized execution
   */
  async handleToolCall(request: MCPRequest): Promise<MCPResponse> {
    const toolName = request.params?.name
    const toolArgs = request.params?.arguments || {}
    
    this.logger.info(`🔧 Handling tools/call request: ${toolName}`, {
      module: 'MCPServer',
      operation: 'handleToolCall',
      data: {
        toolName,
        toolArgs,
        requestId: request.id
      }
    })
    
    if (!toolName) {
      this.logger.error('Missing tool name in request', {
        module: 'MCPServer',
        operation: 'handleToolCall',
        data: { requestId: request.id }
      })
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32602, message: 'Missing tool name' }
      }
    }

    try {
      const result = await this.executeTool(toolName, toolArgs)
      
      this.logger.info(`✅ Tool execution successful: ${toolName}`, {
        module: 'MCPServer',
        operation: 'handleToolCall',
        data: {
          toolName,
          requestId: request.id,
          resultLength: typeof result === 'string' ? result.length : 'object'
        }
      })
      
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [
            {
              type: "text",
              text: result
            }
          ]
        }
      }
    } catch (error) {
      this.logger.error(`Tool execution failed: ${toolName}`, {
        module: 'MCPServer',
        operation: 'handleToolCall',
        error: error instanceof Error ? error : new Error(String(error)),
        data: {
          toolName,
          toolArgs,
          requestId: request.id
        }
      })
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32603, message: `Tool execution failed: ${error}` }
      }
    }
  }

  /**
   * Execute tools with optimized implementations
   */
  async executeTool(toolName: string, args: Record<string, any>): Promise<string> {
    this.logger.debug(`Executing tool: ${toolName}`, {
      module: 'MCPServer',
      operation: 'executeTool',
      data: { toolName, args }
    })
    
    switch (toolName) {
      case 'filesystem.read':
        return await this.readFile(args.path)
      case 'filesystem.write':
        return await this.writeFile(args.path, args.content)
      case 'filesystem.list':
        return await this.listDirectory(args.path)
      case 'system.info':
        return await this.getSystemInfo()
      case 'mcp.status':
        return await this.getMCPStatus()
      default:
        throw new Error(`Unknown tool: ${toolName}`)
    }
  }

  /**
   * Optimized file reading
   */
  async readFile(filePath: string): Promise<string> {
    try {
      this.logger.debug(`Reading file: ${filePath}`, {
        module: 'MCPServer',
        operation: 'readFile',
        data: { filePath }
      })
      
      const content = await fs.readFile(filePath, 'utf8')
      
      this.logger.info(`File read successfully: ${filePath}`, {
        module: 'MCPServer',
        operation: 'readFile',
        data: { filePath, contentLength: content.length }
      })
      
      return `File content for ${filePath}:\n\n${content}`
    } catch (error) {
      this.logger.error(`Failed to read file: ${filePath}`, {
        module: 'MCPServer',
        operation: 'readFile',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { filePath }
      })
      throw new Error(`Failed to read file ${filePath}: ${error}`)
    }
  }

  /**
   * Optimized file writing
   */
  async writeFile(filePath: string, content: string): Promise<string> {
    try {
      this.logger.debug(`Writing file: ${filePath}`, {
        module: 'MCPServer',
        operation: 'writeFile',
        data: { filePath, contentLength: content.length }
      })
      
      await fs.writeFile(filePath, content, 'utf8')
      
      this.logger.info(`File written successfully: ${filePath}`, {
        module: 'MCPServer',
        operation: 'writeFile',
        data: { filePath, contentLength: content.length }
      })
      
      return `Successfully wrote content to ${filePath}`
    } catch (error) {
      this.logger.error(`Failed to write file: ${filePath}`, {
        module: 'MCPServer',
        operation: 'writeFile',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { filePath, contentLength: content.length }
      })
      throw new Error(`Failed to write file ${filePath}: ${error}`)
    }
  }

  /**
   * Optimized directory listing
   */
  async listDirectory(dirPath: string): Promise<string> {
    try {
      this.logger.debug(`Listing directory: ${dirPath}`, {
        module: 'MCPServer',
        operation: 'listDirectory',
        data: { dirPath }
      })
      
      const items = await fs.readdir(dirPath, { withFileTypes: true })
      const files = items.filter(item => item.isFile()).map(item => `📄 ${item.name}`)
      const dirs = items.filter(item => item.isDirectory()).map(item => `📁 ${item.name}`)
      
      this.logger.info(`Directory listed successfully: ${dirPath}`, {
        module: 'MCPServer',
        operation: 'listDirectory',
        data: { dirPath, fileCount: files.length, dirCount: dirs.length }
      })
      
      return `Directory contents for ${dirPath}:\n\n${dirs.join('\n')}\n${files.join('\n')}`
    } catch (error) {
      this.logger.error(`Failed to list directory: ${dirPath}`, {
        module: 'MCPServer',
        operation: 'listDirectory',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { dirPath }
      })
      throw new Error(`Failed to list directory ${dirPath}: ${error}`)
    }
  }

  /**
   * Get system information
   */
  async getSystemInfo(): Promise<string> {
    const info = {
      platform: process.platform,
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      pid: process.pid
    }
    
    this.logger.info('System info retrieved', {
      module: 'MCPServer',
      operation: 'getSystemInfo',
      data: info
    })
    
    return `System Information:\n\n${JSON.stringify(info, null, 2)}`
  }

  /**
   * Get MCP server status
   */
  async getMCPStatus(): Promise<string> {
    const status = {
      serverName: MCP_SERVER_INFO.name,
      version: MCP_SERVER_INFO.version,
      protocolVersion: MCP_PROTOCOL_VERSION,
      isInitialized: this.isInitialized,
      requestCount: this.requestCount,
      debugMode: this.debugMode,
      uptime: process.uptime()
    }
    
    this.logger.info('MCP status retrieved', {
      module: 'MCPServer',
      operation: 'getMCPStatus',
      data: status
    })
    
    return `MCP Server Status:\n\n${JSON.stringify(status, null, 2)}`
  }

  /**
   * Handle notifications list request
   */
  handleNotificationsList(request: MCPRequest): MCPResponse {
    this.logger.debug('Handling notifications/list request', {
      module: 'MCPServer',
      operation: 'handleNotificationsList',
      data: { requestId: request.id }
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
    this.logger.debug('Handling resources/list request', {
      module: 'MCPServer',
      operation: 'handleResourcesList',
      data: { requestId: request.id }
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
    this.logger.debug('Handling prompts/list request', {
      module: 'MCPServer',
      operation: 'handlePromptsList',
      data: { requestId: request.id }
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
   * Send response with optimized output
   */
  sendResponse(response: MCPResponse, requestId: number): void {
    try {
      console.log(JSON.stringify(response))
      this.logger.debug(`📤 [${requestId}] Sent response for request ${response.id}`, {
        module: 'MCPServer',
        operation: 'sendResponse',
        data: { requestId, responseId: response.id }
      })
    } catch (error) {
      this.logger.error('Failed to send response', {
        module: 'MCPServer',
        operation: 'sendResponse',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { requestId, responseId: response.id }
      })
    }
  }

  /**
   * Send error response
   */
  sendError(id: string | number, code: number, message: string): void {
    try {
      const errorResponse: MCPResponse = {
        jsonrpc: "2.0",
        id: id,
        error: { code, message }
      }
      console.log(JSON.stringify(errorResponse))
      
      this.logger.error('Sent error response', {
        module: 'MCPServer',
        operation: 'sendError',
        data: { id, code, message }
      })
    } catch (error) {
      this.logger.error('Failed to send error response', {
        module: 'MCPServer',
        operation: 'sendError',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { id, code, message }
      })
    }
  }

  /**
   * Shutdown server gracefully
   */
  shutdown(): void {
    this.logger.info('🛑 Shutting down MCP Server...', {
      module: 'MCPServer',
      operation: 'shutdown'
    })
    
    try {
      this.rl.close()
      this.logger.info('✅ MCP Server shutdown complete', {
        module: 'MCPServer',
        operation: 'shutdown'
      })
      process.exit(0)
    } catch (error) {
      this.logger.error('Error during shutdown', {
        module: 'MCPServer',
        operation: 'shutdown',
        error: error instanceof Error ? error : new Error(String(error))
      })
      process.exit(1)
    }
  }
}

async function main() {
  const server = new MCPServer()
  await server.start()
}

main().catch(error => {
  console.error('Failed to start MCP server:', error)
  process.exit(1)
}) 