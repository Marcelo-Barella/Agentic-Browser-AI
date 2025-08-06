#!/usr/bin/env node

/**
 * Hybrid MCP Server - Echo Connection + AgenticAI Features
 * Combines the working Echo MCP server's connection handling with our server's features
 * Enhanced with verbose logging for debugging
 */

import express from "express"
import { z } from "zod"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import * as fs from 'fs/promises'
import * as path from 'path'
// import { getLogger } from './core/logger'

// Simple logger for now to avoid module resolution issues
const createSimpleLogger = () => {
  return {
    debug: (message: string, options?: any) => console.debug(`[DEBUG] ${message}`, options),
    info: (message: string, options?: any) => console.info(`[INFO] ${message}`, options),
    warn: (message: string, options?: any) => console.warn(`[WARN] ${message}`, options),
    error: (message: string, options?: any) => console.error(`[ERROR] ${message}`, options),
    critical: (message: string, options?: any) => console.error(`[CRITICAL] ${message}`, options)
  }
}

// Tool schemas using Zod for validation
const ReadFileSchema = z.object({
  path: z.string().describe("Path to the file to read"),
})

const WriteFileSchema = z.object({
  path: z.string().describe("Path to the file to write"),
  content: z.string().describe("Content to write to the file"),
})

const ListDirectorySchema = z.object({
  path: z.string().describe("Path to the directory to list"),
})

const SystemInfoSchema = z.object({})

const MCPStatusSchema = z.object({})

const BrowserInspectSchema = z.object({
  url: z.string().describe("URL to inspect"),
})

const ProjectAnalyzeSchema = z.object({
  projectPath: z.string().describe("Path to the project to analyze"),
})

// Tool names constants
const ToolName = {
  READ_FILE: "filesystem.read",
  WRITE_FILE: "filesystem.write",
  LIST_DIRECTORY: "filesystem.list",
  SYSTEM_INFO: "system.info",
  MCP_STATUS: "mcp.status",
  BROWSER_INSPECT: "browser.inspect",
  PROJECT_ANALYZE: "project.analyze",
} as const

class HybridMCPServer {
  private server: Server
  private app: express.Application
  private transports: Map<string, SSEServerTransport> = new Map()
  private logger: any
  private requestCount: number = 0
  private isInitialized: boolean = false
  private startupTime: Date

  constructor() {
    this.startupTime = new Date()
    console.log(`🚀 [${new Date().toISOString()}] Hybrid MCP Server constructor called`)
    
    // Initialize logger with verbose mode
    this.logger = createSimpleLogger()
    this.logger.info("🔧 [CONSTRUCTOR] Initializing Hybrid MCP Server", {
      module: 'HybridMCPServer',
      operation: 'constructor',
      timestamp: this.startupTime.toISOString(),
      pid: process.pid
    })
    
    try {
      // Set up MCP server with our server info
      console.log(`🔧 [${new Date().toISOString()}] Creating MCP Server instance`)
      this.server = new Server(
        {
          name: "agentic-ai-mcp-server",
          version: "1.0.0",
        },
        {
          capabilities: {
            prompts: {},
            tools: {},
          },
        }
      )
      console.log(`✅ [${new Date().toISOString()}] MCP Server instance created successfully`)

      // Set up Express app
      console.log(`🔧 [${new Date().toISOString()}] Setting up Express application`)
      this.app = express()
      this.app.use(express.json())
      console.log(`✅ [${new Date().toISOString()}] Express application configured`)
      
      this.setupHandlers()
      this.setupRoutes()
      
      console.log(`✅ [${new Date().toISOString()}] Hybrid MCP Server constructor completed`)
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Constructor error:`, error)
      this.logger.error("Constructor failed", {
        module: 'HybridMCPServer',
        operation: 'constructor',
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw error
    }
  }

  private setupHandlers() {
    console.log(`🔧 [${new Date().toISOString()}] Setting up MCP request handlers`)
    this.logger.info("🔧 [SETUP_HANDLERS] Setting up MCP request handlers", {
      module: 'HybridMCPServer',
      operation: 'setupHandlers',
      timestamp: new Date().toISOString()
    })

    // Handle tools list request
    console.log(`🔧 [${new Date().toISOString()}] Registering tools/list handler`)
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      const requestId = ++this.requestCount
      console.log(`📨 [${new Date().toISOString()}] [REQ-${requestId}] tools/list request received`)
      
      this.logger.info(`📨 [REQ-${requestId}] Handling tools/list request`, {
        module: 'HybridMCPServer',
        operation: 'handleToolsList',
        requestId,
        timestamp: new Date().toISOString(),
        requestData: request
      })

      try {
        const tools = [
          {
            name: ToolName.READ_FILE,
            description: "Read file content from filesystem",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to the file to read",
                },
              },
              required: ["path"],
            },
          },
          {
            name: ToolName.WRITE_FILE,
            description: "Write content to filesystem",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to the file to write",
                },
                content: {
                  type: "string",
                  description: "Content to write to the file",
                },
              },
              required: ["path", "content"],
            },
          },
          {
            name: ToolName.LIST_DIRECTORY,
            description: "List directory contents",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to the directory to list",
                },
              },
              required: ["path"],
            },
          },
          {
            name: ToolName.SYSTEM_INFO,
            description: "Get system information and capabilities",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: ToolName.MCP_STATUS,
            description: "Get MCP server status and connection info",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: ToolName.BROWSER_INSPECT,
            description: "Inspect live application through browser",
            inputSchema: {
              type: "object",
              properties: {
                url: {
                  type: "string",
                  description: "URL to inspect",
                },
              },
              required: ["url"],
            },
          },
          {
            name: ToolName.PROJECT_ANALYZE,
            description: "Analyze project structure and dependencies",
            inputSchema: {
              type: "object",
              properties: {
                projectPath: {
                  type: "string",
                  description: "Path to the project to analyze",
                },
              },
              required: ["projectPath"],
            },
          },
        ]

        console.log(`✅ [${new Date().toISOString()}] [REQ-${requestId}] Returning ${tools.length} tools`)
        this.logger.info(`✅ [REQ-${requestId}] Tools list request handled successfully`, {
          module: 'HybridMCPServer',
          operation: 'handleToolsList',
          requestId,
          toolCount: tools.length,
          toolNames: tools.map(t => t.name)
        })

        return { tools }
      } catch (error) {
        console.error(`❌ [${new Date().toISOString()}] [REQ-${requestId}] Tools list error:`, error)
        this.logger.error(`❌ [REQ-${requestId}] Tools list request failed`, {
          module: 'HybridMCPServer',
          operation: 'handleToolsList',
          requestId,
          error: error instanceof Error ? error : new Error(String(error))
        })
        throw error
      }
    })

    // Handle tool call requests
    console.log(`🔧 [${new Date().toISOString()}] Registering tools/call handler`)
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const requestId = ++this.requestCount
      const { name, arguments: args } = request.params
      
      console.log(`📨 [${new Date().toISOString()}] [REQ-${requestId}] tools/call request received: ${name}`)
      console.log(`📋 [${new Date().toISOString()}] [REQ-${requestId}] Arguments:`, JSON.stringify(args, null, 2))
      
      this.logger.info(`📨 [REQ-${requestId}] Handling tools/call request: ${name}`, {
        module: 'HybridMCPServer',
        operation: 'handleToolCall',
        requestId,
        toolName: name,
        args,
        timestamp: new Date().toISOString()
      })

      try {
        let result: string
        console.log(`🔧 [${new Date().toISOString()}] [REQ-${requestId}] Executing tool: ${name}`)

        switch (name) {
          case ToolName.READ_FILE:
            console.log(`📖 [${new Date().toISOString()}] [REQ-${requestId}] Executing readFile tool`)
            const readArgs = ReadFileSchema.parse(args)
            result = await this.readFile(readArgs.path)
            break

          case ToolName.WRITE_FILE:
            console.log(`✍️ [${new Date().toISOString()}] [REQ-${requestId}] Executing writeFile tool`)
            const writeArgs = WriteFileSchema.parse(args)
            result = await this.writeFile(writeArgs.path, writeArgs.content)
            break

          case ToolName.LIST_DIRECTORY:
            console.log(`📁 [${new Date().toISOString()}] [REQ-${requestId}] Executing listDirectory tool`)
            const listArgs = ListDirectorySchema.parse(args)
            result = await this.listDirectory(listArgs.path)
            break

          case ToolName.SYSTEM_INFO:
            console.log(`💻 [${new Date().toISOString()}] [REQ-${requestId}] Executing getSystemInfo tool`)
            const sysArgs = SystemInfoSchema.parse(args)
            result = await this.getSystemInfo()
            break

          case ToolName.MCP_STATUS:
            console.log(`📊 [${new Date().toISOString()}] [REQ-${requestId}] Executing getMCPStatus tool`)
            const statusArgs = MCPStatusSchema.parse(args)
            result = await this.getMCPStatus()
            break

          case ToolName.BROWSER_INSPECT:
            console.log(`🌐 [${new Date().toISOString()}] [REQ-${requestId}] Executing inspectBrowser tool`)
            const browserArgs = BrowserInspectSchema.parse(args)
            result = await this.inspectBrowser(browserArgs.url)
            break

          case ToolName.PROJECT_ANALYZE:
            console.log(`🔍 [${new Date().toISOString()}] [REQ-${requestId}] Executing analyzeProject tool`)
            const projectArgs = ProjectAnalyzeSchema.parse(args)
            result = await this.analyzeProject(projectArgs.projectPath)
            break

          default:
            const errorMsg = `Unknown tool: ${name}`
            console.error(`❌ [${new Date().toISOString()}] [REQ-${requestId}] ${errorMsg}`)
            throw new Error(errorMsg)
        }

        console.log(`✅ [${new Date().toISOString()}] [REQ-${requestId}] Tool execution successful: ${name}`)
        console.log(`📊 [${new Date().toISOString()}] [REQ-${requestId}] Result length: ${result.length} characters`)
        
        this.logger.info(`✅ [REQ-${requestId}] Tool execution successful: ${name}`, {
          module: 'HybridMCPServer',
          operation: 'handleToolCall',
          requestId,
          toolName: name,
          resultLength: result.length,
          resultPreview: result.substring(0, 200) + (result.length > 200 ? '...' : '')
        })

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        }
      } catch (error) {
        console.error(`❌ [${new Date().toISOString()}] [REQ-${requestId}] Tool execution failed: ${name}`)
        console.error(`❌ [${new Date().toISOString()}] [REQ-${requestId}] Error details:`, error)
        
        this.logger.error(`❌ [REQ-${requestId}] Tool execution failed: ${name}`, {
          module: 'HybridMCPServer',
          operation: 'handleToolCall',
          requestId,
          toolName: name,
          args,
          error: error instanceof Error ? error : new Error(String(error)),
          errorStack: error instanceof Error ? error.stack : undefined
        })
        throw error
      }
    })

    console.log(`✅ [${new Date().toISOString()}] MCP request handlers setup completed`)
  }

  private setupRoutes() {
    console.log(`🔧 [${new Date().toISOString()}] Setting up Express routes`)
    
    // SSE endpoint for establishing connection
    console.log(`🔧 [${new Date().toISOString()}] Setting up SSE endpoint: /sse`)
    this.app.get("/sse", async (req, res) => {
      const sessionId = (req.query.sessionId as string) || "default"
      const timestamp = new Date().toISOString()
      
      console.log(`📡 [${timestamp}] SSE connection request received`)
      console.log(`📋 [${timestamp}] Session ID: ${sessionId}`)
      console.log(`📋 [${timestamp}] Query params:`, req.query)
      console.log(`📋 [${timestamp}] Headers:`, req.headers)
      
      this.logger.info(`📡 [SSE] Connection request for session: ${sessionId}`, {
        module: 'HybridMCPServer',
        operation: 'setupRoutes',
        sessionId,
        timestamp,
        queryParams: req.query,
        headers: req.headers
      })

      try {
        let transport = this.transports.get(sessionId)
        if (!transport) {
          console.log(`🔧 [${timestamp}] Creating new transport for session: ${sessionId}`)
          transport = new SSEServerTransport("/message", res)
          this.transports.set(sessionId, transport)
          console.log(`✅ [${timestamp}] Transport created and stored for session: ${sessionId}`)

          console.log(`🔧 [${timestamp}] Connecting transport to MCP server`)
          await this.server.connect(transport)
          console.log(`✅ [${timestamp}] Transport connected to MCP server successfully`)

          transport.onclose = () => {
            const closeTime = new Date().toISOString()
            console.log(`🔌 [${closeTime}] SSE connection closed for session: ${sessionId}`)
            this.transports.delete(sessionId)
            console.log(`🗑️ [${closeTime}] Transport removed for session: ${sessionId}`)
            
            this.logger.info(`🔌 [SSE] Connection closed for session: ${sessionId}`, {
              module: 'HybridMCPServer',
              operation: 'transportClose',
              sessionId,
              timestamp: closeTime,
              activeTransports: this.transports.size
            })
          }

          console.log(`✅ [${timestamp}] SSE connection established for session: ${sessionId}`)
          this.logger.info(`✅ [SSE] Connection established for session: ${sessionId}`, {
            module: 'HybridMCPServer',
            operation: 'setupRoutes',
            sessionId,
            timestamp,
            activeTransports: this.transports.size
          })
        } else {
          console.log(`ℹ️ [${timestamp}] Transport already exists for session: ${sessionId}`)
        }
      } catch (error) {
        console.error(`❌ [${timestamp}] SSE connection error:`, error)
        this.logger.error(`❌ [SSE] Connection error for session: ${sessionId}`, {
          module: 'HybridMCPServer',
          operation: 'setupRoutes',
          sessionId,
          timestamp,
          error: error instanceof Error ? error : new Error(String(error))
        })
        res.status(500).json({ error: "SSE connection failed" })
      }
    })

    // Message endpoint for handling requests
    console.log(`🔧 [${new Date().toISOString()}] Setting up message endpoint: /message`)
    this.app.post("/message", async (req, res) => {
      const sessionId = (req.headers["x-session-id"] as string) || "default"
      const timestamp = new Date().toISOString()
      
      console.log(`📨 [${timestamp}] Message request received`)
      console.log(`📋 [${timestamp}] Session ID: ${sessionId}`)
      console.log(`📋 [${timestamp}] Headers:`, req.headers)
      console.log(`📋 [${timestamp}] Body:`, JSON.stringify(req.body, null, 2))
      
      this.logger.info(`📨 [MESSAGE] Request for session: ${sessionId}`, {
        module: 'HybridMCPServer',
        operation: 'handleMessage',
        sessionId,
        timestamp,
        headers: req.headers,
        body: req.body
      })

      try {
        const transport = this.transports.get(sessionId)

        if (!transport) {
          console.error(`❌ [${timestamp}] Session not found: ${sessionId}`)
          console.log(`📋 [${timestamp}] Available sessions:`, Array.from(this.transports.keys()))
          
          this.logger.error(`❌ [MESSAGE] Session not found: ${sessionId}`, {
            module: 'HybridMCPServer',
            operation: 'handleMessage',
            sessionId,
            timestamp,
            availableSessions: Array.from(this.transports.keys())
          })
          return res.status(404).json({ error: "Session not found" })
        }

        console.log(`✅ [${timestamp}] Transport found for session: ${sessionId}`)
        console.log(`🔧 [${timestamp}] Handling message with transport`)
        
        await transport.handleMessage(req.body)
        console.log(`✅ [${timestamp}] Message handled successfully`)
        
        res.status(200).end()
        console.log(`✅ [${timestamp}] Response sent: 200 OK`)
        
      } catch (error) {
        console.error(`❌ [${timestamp}] Error handling message:`, error)
        this.logger.error(`❌ [MESSAGE] Error handling message`, {
          module: 'HybridMCPServer',
          operation: 'handleMessage',
          sessionId,
          timestamp,
          error: error instanceof Error ? error : new Error(String(error)),
          errorStack: error instanceof Error ? error.stack : undefined
        })
        res.status(500).json({ error: "Internal server error" })
      }
    })

    console.log(`✅ [${new Date().toISOString()}] Express routes setup completed`)
  }

  // Tool implementations from our original server
  async readFile(filePath: string): Promise<string> {
    const timestamp = new Date().toISOString()
    console.log(`📖 [${timestamp}] Reading file: ${filePath}`)
    
    try {
      this.logger.debug(`📖 [READ_FILE] Reading file: ${filePath}`, {
        module: 'HybridMCPServer',
        operation: 'readFile',
        filePath,
        timestamp
      })
      
      const content = await fs.readFile(filePath, 'utf8')
      
      console.log(`✅ [${timestamp}] File read successfully: ${filePath}`)
      console.log(`📊 [${timestamp}] Content length: ${content.length} characters`)
      
      this.logger.info(`✅ [READ_FILE] File read successfully: ${filePath}`, {
        module: 'HybridMCPServer',
        operation: 'readFile',
        filePath,
        contentLength: content.length,
        timestamp
      })
      
      return `File content for ${filePath}:\n\n${content}`
    } catch (error) {
      console.error(`❌ [${timestamp}] Failed to read file: ${filePath}`)
      console.error(`❌ [${timestamp}] Error details:`, error)
      
      this.logger.error(`❌ [READ_FILE] Failed to read file: ${filePath}`, {
        module: 'HybridMCPServer',
        operation: 'readFile',
        filePath,
        timestamp,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to read file ${filePath}: ${error}`)
    }
  }

  async writeFile(filePath: string, content: string): Promise<string> {
    const timestamp = new Date().toISOString()
    console.log(`✍️ [${timestamp}] Writing file: ${filePath}`)
    console.log(`📊 [${timestamp}] Content length: ${content.length} characters`)
    
    try {
      this.logger.debug(`✍️ [WRITE_FILE] Writing file: ${filePath}`, {
        module: 'HybridMCPServer',
        operation: 'writeFile',
        filePath,
        contentLength: content.length,
        timestamp
      })
      
      await fs.writeFile(filePath, content, 'utf8')
      
      console.log(`✅ [${timestamp}] File written successfully: ${filePath}`)
      
      this.logger.info(`✅ [WRITE_FILE] File written successfully: ${filePath}`, {
        module: 'HybridMCPServer',
        operation: 'writeFile',
        filePath,
        contentLength: content.length,
        timestamp
      })
      
      return `Successfully wrote content to ${filePath}`
    } catch (error) {
      console.error(`❌ [${timestamp}] Failed to write file: ${filePath}`)
      console.error(`❌ [${timestamp}] Error details:`, error)
      
      this.logger.error(`❌ [WRITE_FILE] Failed to write file: ${filePath}`, {
        module: 'HybridMCPServer',
        operation: 'writeFile',
        filePath,
        contentLength: content.length,
        timestamp,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to write file ${filePath}: ${error}`)
    }
  }

  async listDirectory(dirPath: string): Promise<string> {
    const timestamp = new Date().toISOString()
    console.log(`📁 [${timestamp}] Listing directory: ${dirPath}`)
    
    try {
      this.logger.debug(`📁 [LIST_DIRECTORY] Listing directory: ${dirPath}`, {
        module: 'HybridMCPServer',
        operation: 'listDirectory',
        dirPath,
        timestamp
      })
      
      const items = await fs.readdir(dirPath, { withFileTypes: true })
      const files = items.filter(item => item.isFile()).map(item => `📄 ${item.name}`)
      const dirs = items.filter(item => item.isDirectory()).map(item => `📁 ${item.name}`)
      
      console.log(`✅ [${timestamp}] Directory listed successfully: ${dirPath}`)
      console.log(`📊 [${timestamp}] Files: ${files.length}, Directories: ${dirs.length}`)
      
      this.logger.info(`✅ [LIST_DIRECTORY] Directory listed successfully: ${dirPath}`, {
        module: 'HybridMCPServer',
        operation: 'listDirectory',
        dirPath,
        fileCount: files.length,
        dirCount: dirs.length,
        timestamp
      })
      
      return `Directory contents for ${dirPath}:\n\n${dirs.join('\n')}\n${files.join('\n')}`
    } catch (error) {
      console.error(`❌ [${timestamp}] Failed to list directory: ${dirPath}`)
      console.error(`❌ [${timestamp}] Error details:`, error)
      
      this.logger.error(`❌ [LIST_DIRECTORY] Failed to list directory: ${dirPath}`, {
        module: 'HybridMCPServer',
        operation: 'listDirectory',
        dirPath,
        timestamp,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to list directory ${dirPath}: ${error}`)
    }
  }

  async getSystemInfo(): Promise<string> {
    const timestamp = new Date().toISOString()
    console.log(`💻 [${timestamp}] Getting system information`)
    
    const info = {
      platform: process.platform,
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      pid: process.pid
    }
    
    console.log(`✅ [${timestamp}] System info retrieved`)
    console.log(`📊 [${timestamp}] Platform: ${info.platform}`)
    console.log(`📊 [${timestamp}] Node version: ${info.nodeVersion}`)
    console.log(`📊 [${timestamp}] Uptime: ${info.uptime}s`)
    
    this.logger.info(`✅ [SYSTEM_INFO] System info retrieved`, {
      module: 'HybridMCPServer',
      operation: 'getSystemInfo',
      data: info,
      timestamp
    })
    
    return `System Information:\n\n${JSON.stringify(info, null, 2)}`
  }

  async getMCPStatus(): Promise<string> {
    const timestamp = new Date().toISOString()
    console.log(`📊 [${timestamp}] Getting MCP server status`)
    
    const status = {
      serverName: "agentic-ai-mcp-server",
      version: "1.0.0",
      isInitialized: this.isInitialized,
      requestCount: this.requestCount,
      activeTransports: this.transports.size,
      uptime: process.uptime(),
      startupTime: this.startupTime.toISOString()
    }
    
    console.log(`✅ [${timestamp}] MCP status retrieved`)
    console.log(`📊 [${timestamp}] Active transports: ${status.activeTransports}`)
    console.log(`📊 [${timestamp}] Request count: ${status.requestCount}`)
    console.log(`📊 [${timestamp}] Uptime: ${status.uptime}s`)
    
    this.logger.info(`✅ [MCP_STATUS] MCP status retrieved`, {
      module: 'HybridMCPServer',
      operation: 'getMCPStatus',
      data: status,
      timestamp
    })
    
    return `MCP Server Status:\n\n${JSON.stringify(status, null, 2)}`
  }

  async inspectBrowser(url: string): Promise<string> {
    const timestamp = new Date().toISOString()
    console.log(`🌐 [${timestamp}] Browser inspection requested for: ${url}`)
    
    this.logger.info(`🌐 [BROWSER_INSPECT] Browser inspection requested for: ${url}`, {
      module: 'HybridMCPServer',
      operation: 'inspectBrowser',
      url,
      timestamp
    })
    
    return `Browser inspection for ${url}:\n\nThis feature is available but requires browser integration module to be fully implemented.`
  }

  async analyzeProject(projectPath: string): Promise<string> {
    const timestamp = new Date().toISOString()
    console.log(`🔍 [${timestamp}] Project analysis requested for: ${projectPath}`)
    
    try {
      this.logger.info(`🔍 [PROJECT_ANALYZE] Project analysis requested for: ${projectPath}`, {
        module: 'HybridMCPServer',
        operation: 'analyzeProject',
        projectPath,
        timestamp
      })
      
      const stats = await fs.stat(projectPath)
      if (!stats.isDirectory()) {
        throw new Error('Project path is not a directory')
      }
      
      const items = await fs.readdir(projectPath, { withFileTypes: true })
      const files = items.filter(item => item.isFile()).map(item => item.name)
      const dirs = items.filter(item => item.isDirectory()).map(item => item.name)
      
      const analysis = {
        projectPath,
        totalItems: items.length,
        files: files.length,
        directories: dirs.length,
        fileList: files.slice(0, 10), // Show first 10 files
        directoryList: dirs.slice(0, 10) // Show first 10 directories
      }
      
      console.log(`✅ [${timestamp}] Project analysis completed`)
      console.log(`📊 [${timestamp}] Total items: ${analysis.totalItems}`)
      console.log(`📊 [${timestamp}] Files: ${analysis.files}, Directories: ${analysis.directories}`)
      
      this.logger.info(`✅ [PROJECT_ANALYZE] Project analysis completed`, {
        module: 'HybridMCPServer',
        operation: 'analyzeProject',
        data: analysis,
        timestamp
      })
      
      return `Project Analysis for ${projectPath}:\n\n${JSON.stringify(analysis, null, 2)}`
    } catch (error) {
      console.error(`❌ [${timestamp}] Project analysis failed: ${projectPath}`)
      console.error(`❌ [${timestamp}] Error details:`, error)
      
      this.logger.error(`❌ [PROJECT_ANALYZE] Project analysis failed: ${projectPath}`, {
        module: 'HybridMCPServer',
        operation: 'analyzeProject',
        projectPath,
        timestamp,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to analyze project ${projectPath}: ${error}`)
    }
  }

  public start(port: number = 3001) {
    const timestamp = new Date().toISOString()
    console.log(`🚀 [${timestamp}] Starting Hybrid MCP Server on port ${port}`)
    
    this.isInitialized = true
    
    this.app.listen(port, () => {
      const startTime = new Date().toISOString()
      console.log(`✅ [${startTime}] 🚀 Hybrid MCP Server running on port ${port}`)
      console.log(`📡 [${startTime}] SSE endpoint: http://localhost:${port}/sse`)
      console.log(`📨 [${startTime}] Message endpoint: http://localhost:${port}/message`)
      console.log(`🔧 [${startTime}] Server startup time: ${this.startupTime.toISOString()}`)
      console.log(`📊 [${startTime}] Process ID: ${process.pid}`)
      console.log(`📊 [${startTime}] Node version: ${process.version}`)
      console.log(`📊 [${startTime}] Platform: ${process.platform}`)
      
      this.logger.info(`✅ [START] Hybrid MCP Server started successfully`, {
        module: 'HybridMCPServer',
        operation: 'start',
        port,
        startupTime: this.startupTime.toISOString(),
        startTime,
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform
      })
    })
  }
}

// Start the server
console.log(`🚀 [${new Date().toISOString()}] Creating Hybrid MCP Server instance`)
const server = new HybridMCPServer()
console.log(`🚀 [${new Date().toISOString()}] Starting Hybrid MCP Server`)
server.start() 