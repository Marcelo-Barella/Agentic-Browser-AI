#!/usr/bin/env node

/**
 * MCP Server for Cursor Integration
 * Addresses timeout issues with faster response times
 */

import * as readline from 'readline'
import * as fs from 'fs/promises'
import * as path from 'path'
import { getLogger } from './core/logger.js'
import { BrowserManager } from './modules/browser/browser-manager.js'
import { BrowserTools } from './modules/browser/browser-tools.js'

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

/**
 * Utility function to automatically inject headless parameter to browser tools
 * Browser tools are identified by having a sessionId parameter
 */
function injectHeadlessParameter(properties: Record<string, any>): Record<string, any> {
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
 * Utility function to create a browser tool schema with automatic headless parameter injection
 */
function createBrowserToolSchema(toolSchema: any): any {
  return {
    ...toolSchema,
    inputSchema: {
      ...toolSchema.inputSchema,
      properties: injectHeadlessParameter(toolSchema.inputSchema.properties)
    }
  }
}

class MCPServer {
  private rl: readline.Interface
  private isInitialized: boolean = false
  private requestCount: number = 0
  private debugMode: boolean
  private logger: any
  private logFilePath!: string
  private browserManager: BrowserManager
  private browserTools: BrowserTools

  constructor() {
    this.debugMode = process.env.DEBUG_MCP === 'true'
    
    // Initialize main logger
    this.logger = getLogger()
    
    // Initialize browser components
    this.browserManager = new BrowserManager()
    this.browserTools = new BrowserTools(this.browserManager)
    
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
      
      // Initialize browser tools
      await this.browserTools.initialize()
      
      this.logger.info('🌐 Browser automation tools initialized', {
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
      process.on('SIGINT', async () => await this.shutdown())
      process.on('SIGTERM', async () => await this.shutdown())
      
      // Handle uncaught exceptions
      process.on('uncaughtException', async (error) => {
        this.logger.critical('Uncaught exception', {
          module: 'MCPServer',
          operation: 'uncaughtException',
          error: error instanceof Error ? error : new Error(String(error))
        })
        await this.shutdown()
      })
      
      process.on('unhandledRejection', async (reason, promise) => {
        this.logger.critical('Unhandled promise rejection', {
          module: 'MCPServer',
          operation: 'unhandledRejection',
          error: reason instanceof Error ? reason : new Error(String(reason)),
          data: { promise: promise.toString() }
        })
        await this.shutdown()
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
      this.sendError(requestId, -32700, 'Parse error')
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
    
    const response: MCPResponse = {
      jsonrpc: "2.0" as const,
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
    
    // Pre-define browser-only tools with AI selectors
    const tools = [
      createBrowserToolSchema({
        name: "browser.navigate",
        description: "Navigate to URL with options",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            },
            url: {
              type: "string",
              description: "URL to navigate to"
            },
            timeout: {
              type: "number",
              description: "Navigation timeout in milliseconds"
            },
            waitUntil: {
              type: "string",
              description: "Wait condition: load, domcontentloaded, networkidle0, networkidle2"
            }
          },
          required: ["sessionId", "url"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.find_element_ai",
        description: "Find element using AI-powered natural language description",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: { type: "string", description: "Browser session ID" },
            description: { type: "string", description: "Natural language description" },
            context: { type: "object", description: "Optional search context" }
          },
          required: ["sessionId", "description"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.generate_selectors",
        description: "Generate multiple robust selectors for an element",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: { type: "string", description: "Browser session ID" },
            elementSelector: { type: "string", description: "Initial CSS selector" }
          },
          required: ["sessionId", "elementSelector"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.analyze_page_semantics",
        description: "Analyze page structure and element relationships",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: { type: "string", description: "Browser session ID" }
          },
          required: ["sessionId"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.click",
        description: "Click element by selector",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            },
            selector: {
              type: "string",
              description: "CSS selector for element to click"
            },
            timeout: {
              type: "number",
              description: "Timeout in milliseconds"
            },
            waitForVisible: {
              type: "boolean",
              description: "Wait for element to be visible"
            }
          },
          required: ["sessionId", "selector"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.fill",
        description: "Fill form element with value",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            },
            selector: {
              type: "string",
              description: "CSS selector for element to fill"
            },
            value: {
              type: "string",
              description: "Value to fill"
            },
            timeout: {
              type: "number",
              description: "Timeout in milliseconds"
            }
          },
          required: ["sessionId", "selector", "value"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.select",
        description: "Select option from dropdown",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            },
            selector: {
              type: "string",
              description: "CSS selector for select element"
            },
            value: {
              type: "string",
              description: "Value to select"
            }
          },
          required: ["sessionId", "selector", "value"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.wait",
        description: "Wait for element or condition",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            },
            selector: {
              type: "string",
              description: "CSS selector to wait for"
            },
            timeout: {
              type: "number",
              description: "Timeout in milliseconds"
            },
            condition: {
              type: "string",
              description: "Wait condition: visible, enabled, clickable"
            }
          },
          required: ["sessionId", "selector"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.screenshot",
        description: "Capture page or element screenshot",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            },

            quality: {
              type: "number",
              description: "Image quality (1-100)"
            },
            type: {
              type: "string",
              description: "Image type: png, jpeg"
            },
            path: {
              type: "string",
              description: "Path to save screenshot"
            }
          },
          required: ["sessionId"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.intelligentScreenshot",
        description: "Take intelligent screenshot focusing on relevant content using AI",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            },
            description: {
              type: "string",
              description: "Natural language description of what to capture"
            },
            focus: {
              type: "string",
              description: "Focus area: content, interactive, errors, semantic, auto",
              enum: ["content", "interactive", "errors", "semantic", "auto"]
            },
            semanticRegion: {
              type: "string",
              description: "Semantic region to capture: header, main, footer, nav, aside, form",
              enum: ["header", "main", "footer", "nav", "aside", "form"]
            },
            minConfidence: {
              type: "number",
              description: "Minimum confidence threshold (0-1)"
            },
            quality: {
              type: "number",
              description: "Image quality (1-100)"
            },
            type: {
              type: "string",
              description: "Image type: png, jpeg"
            },
            path: {
              type: "string",
              description: "Path to save screenshot"
            }
          },
          required: ["sessionId"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.captureContentArea",
        description: "Capture screenshot of main content areas",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            },
            minConfidence: {
              type: "number",
              description: "Minimum confidence threshold (0-1)"
            },
            quality: {
              type: "number",
              description: "Image quality (1-100)"
            },
            type: {
              type: "string",
              description: "Image type: png, jpeg"
            },
            path: {
              type: "string",
              description: "Path to save screenshot"
            }
          },
          required: ["sessionId"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.captureInteractiveElements",
        description: "Capture screenshot of interactive elements like forms and buttons",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            },
            minConfidence: {
              type: "number",
              description: "Minimum confidence threshold (0-1)"
            },
            quality: {
              type: "number",
              description: "Image quality (1-100)"
            },
            type: {
              type: "string",
              description: "Image type: png, jpeg"
            },
            path: {
              type: "string",
              description: "Path to save screenshot"
            }
          },
          required: ["sessionId"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.captureErrorStates",
        description: "Capture screenshot of error messages and problematic areas",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            },
            minConfidence: {
              type: "number",
              description: "Minimum confidence threshold (0-1)"
            },
            quality: {
              type: "number",
              description: "Image quality (1-100)"
            },
            type: {
              type: "string",
              description: "Image type: png, jpeg"
            },
            path: {
              type: "string",
              description: "Path to save screenshot"
            }
          },
          required: ["sessionId"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.captureSemanticRegion",
        description: "Capture screenshot of specific semantic regions",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            },
            region: {
              type: "string",
              description: "Semantic region to capture",
              enum: ["header", "main", "footer", "nav", "aside", "form"]
            },
            minConfidence: {
              type: "number",
              description: "Minimum confidence threshold (0-1)"
            },
            quality: {
              type: "number",
              description: "Image quality (1-100)"
            },
            type: {
              type: "string",
              description: "Image type: png, jpeg"
            },
            path: {
              type: "string",
              description: "Path to save screenshot"
            }
          },
          required: ["sessionId", "region"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.extract",
        description: "Extract content from specific elements",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            },
            selector: {
              type: "string",
              description: "CSS selector for element to extract"
            },
            format: {
              type: "string",
              description: "Output format: text, html, json"
            }
          },
          required: ["sessionId", "selector"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.execute",
        description: "Execute JavaScript code",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            },
            script: {
              type: "string",
              description: "JavaScript code to execute"
            },
            timeout: {
              type: "number",
              description: "Execution timeout in milliseconds"
            },
            sandbox: {
              type: "boolean",
              description: "Run in sandbox mode"
            }
          },
          required: ["sessionId", "script"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.back",
        description: "Navigate back in history",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            }
          },
          required: ["sessionId"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.forward",
        description: "Navigate forward in history",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            }
          },
          required: ["sessionId"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.refresh",
        description: "Refresh current page",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            }
          },
          required: ["sessionId"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.html",
        description: "Get page HTML content",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            },
            sanitize: {
              type: "boolean",
              description: "Sanitize HTML content"
            }
          },
          required: ["sessionId"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.text",
        description: "Extract text content from page",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            },
            selector: {
              type: "string",
              description: "CSS selector for specific element"
            }
          },
          required: ["sessionId"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.inspect",
        description: "Inspect browser page and get detailed information",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "URL to inspect"
            }
          },
          required: ["url"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.network",
        description: "Monitor network requests and responses",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            },
            action: {
              type: "string",
              description: "Network monitoring action: start, stop, get"
            }
          },
          required: ["sessionId", "action"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.state",
        description: "Manage cookies and browser storage",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            },
            action: {
              type: "string",
              description: "State management action: getCookies, setCookie, deleteCookie, getLocalStorage, setLocalStorageItem"
            },
            key: {
              type: "string",
              description: "Storage key"
            },
            value: {
              type: "string",
              description: "Storage value"
            },
            domain: {
              type: "string",
              description: "Cookie domain"
            }
          },
          required: ["sessionId", "action"]
        }
      }),
      createBrowserToolSchema({
        name: "browser.scroll",
        description: "Scroll page or specific elements",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Browser session ID"
            },
            selector: {
              type: "string",
              description: "CSS selector for element to scroll"
            },
            x: {
              type: "number",
              description: "Horizontal scroll amount"
            },
            y: {
              type: "number",
              description: "Vertical scroll amount"
            }
          },
          required: ["sessionId"]
        }
      })
    ]
    
    const response: MCPResponse = {
      jsonrpc: "2.0" as const,
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
      // Removed non-browser tools
      case 'browser.navigate':
        return await this.executeBrowserTool('navigate', args)
      case 'browser.click':
        return await this.executeBrowserTool('click', args)
      case 'browser.fill':
        return await this.executeBrowserTool('fill', args)
      case 'browser.select':
        return await this.executeBrowserTool('select', args)
      case 'browser.wait':
        return await this.executeBrowserTool('wait', args)
      case 'browser.screenshot':
        return await this.executeBrowserTool('screenshot', args)
      case 'browser.intelligentScreenshot':
        return await this.executeBrowserTool('intelligentScreenshot', args)
      case 'browser.captureContentArea':
        return await this.executeBrowserTool('captureContentArea', args)
      case 'browser.captureInteractiveElements':
        return await this.executeBrowserTool('captureInteractiveElements', args)
      case 'browser.captureErrorStates':
        return await this.executeBrowserTool('captureErrorStates', args)
      case 'browser.captureSemanticRegion':
        return await this.executeBrowserTool('captureSemanticRegion', args)
      case 'browser.extract':
        return await this.executeBrowserTool('extract', args)
      case 'browser.execute':
        return await this.executeBrowserTool('execute', args)
      case 'browser.back':
        return await this.executeBrowserTool('back', args)
      case 'browser.forward':
        return await this.executeBrowserTool('forward', args)
      case 'browser.refresh':
        return await this.executeBrowserTool('refresh', args)
      case 'browser.html':
        return await this.executeBrowserTool('getHTML', args)
      case 'browser.text':
        return await this.executeBrowserTool('getText', args)
      case 'browser.inspect':
        const headless = args.headless === 'false' ? false : 
                        args.headless === 'true' ? true : 
                        args.headless !== undefined ? Boolean(args.headless) : true
        return await this.executeBrowserInspect(args.url, headless)
      case 'browser.find_element_ai':
        return await this.executeBrowserTool('findElementAI', args)
      case 'browser.generate_selectors':
        return await this.executeBrowserTool('generateSelectorsAI', args)
      case 'browser.analyze_page_semantics':
        return await this.executeBrowserTool('analyzeSemanticsAI', args)
      case 'browser.network':
        return await this.executeBrowserTool('network', args)
      case 'browser.state':
        return await this.executeBrowserTool('state', args)
      case 'browser.scroll':
        return await this.executeBrowserTool('scroll', args)
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
      uptime: process.uptime(),
      browserTools: {
        ready: this.browserTools.isReady(),
        activeSessions: this.browserTools.getActiveSessions().length,
        stats: this.browserTools.getBrowserStats()
      }
    }
    
    this.logger.info('MCP status retrieved', {
      module: 'MCPServer',
      operation: 'getMCPStatus',
      data: status
    })
    
    return `MCP Server Status:\n\n${JSON.stringify(status, null, 2)}`
  }

  /**
   * Execute browser tool
   */
  async executeBrowserTool(method: string, args: Record<string, any>): Promise<string> {
    try {
      const sessionId = args.sessionId || `session_${Date.now()}`
      
      // Extract headless parameter and convert to boolean
      const headless = args.headless === 'false' ? false : 
                      args.headless === 'true' ? true : 
                      args.headless !== undefined ? Boolean(args.headless) : true
      
      // Ensure browser tools are initialized
      if (!this.browserTools.isReady()) {
        await this.browserTools.initialize()
      }
      
      // Create session if it doesn't exist
      const activeSessions = this.browserTools.getActiveSessions()
      if (!activeSessions.includes(sessionId)) {
        const createResult = await this.browserTools.createSession(sessionId, undefined, { headless })
        if (!createResult.success) {
          throw new Error(`Failed to create browser session: ${createResult.error}`)
        }
      }
      
      let result: any
      
      switch (method) {
        case 'navigate':
          result = await this.browserTools.navigate(sessionId, args.url, args)
          break
        case 'click':
          result = await this.browserTools.click(sessionId, args.selector, args)
          break
        case 'fill':
          result = await this.browserTools.fill(sessionId, args.selector, args.value, args)
          break
        case 'select':
          result = await this.browserTools.select(sessionId, args.selector, args.value, args)
          break
        case 'wait':
          result = await this.browserTools.wait(sessionId, args.selector, args)
          break
        case 'screenshot':
          result = await this.browserTools.screenshot(sessionId, args)
          break
        case 'intelligentScreenshot':
          result = await this.browserTools.intelligentScreenshot(sessionId, args.description, args)
          break
        case 'captureContentArea':
          result = await this.browserTools.captureContentArea(sessionId, args)
          break
        case 'captureInteractiveElements':
          result = await this.browserTools.captureInteractiveElements(sessionId, args)
          break
        case 'captureErrorStates':
          result = await this.browserTools.captureErrorStates(sessionId, args)
          break
        case 'captureSemanticRegion':
          result = await this.browserTools.captureSemanticRegion(sessionId, args.region, args)
          break
        case 'extract':
          result = await this.browserTools.extract(sessionId, args.selector, args)
          break
        case 'execute':
          result = await this.browserTools.execute(sessionId, args.script, args)
          break
        case 'back':
          result = await this.browserTools.back(sessionId)
          break
        case 'forward':
          result = await this.browserTools.forward(sessionId)
          break
        case 'refresh':
          result = await this.browserTools.refresh(sessionId)
          break
        case 'getHTML':
          result = await this.browserTools.getHTML(sessionId)
          break
        case 'getText':
          result = await this.browserTools.getText(sessionId, args.selector)
          break
        case 'findElementAI':
          result = await this.browserTools.findElementAI(sessionId, args.description, args.context)
          break
        case 'generateSelectorsAI':
          result = await this.browserTools.generateSelectorsAI(sessionId, args.elementSelector)
          break
        case 'analyzeSemanticsAI':
          result = await this.browserTools.analyzeSemanticsAI(sessionId)
          break
        case 'network':
          result = await this.browserTools.network(sessionId, args.action)
          break
        case 'state':
          result = await this.browserTools.state(sessionId, args.action, args.key, args.value, args.domain)
          break
        case 'scroll':
          result = await this.browserTools.scroll(sessionId, args.selector, args.x, args.y)
          break
        default:
          throw new Error(`Unknown browser method: ${method}`)
      }
      
      if (result.success) {
        return `Browser operation '${method}' completed successfully:\n\n${JSON.stringify(result.data, null, 2)}`
      } else {
        throw new Error(result.error || 'Browser operation failed')
      }
    } catch (error) {
      this.logger.error(`Browser tool execution failed: ${method}`, {
        module: 'MCPServer',
        operation: 'executeBrowserTool',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { method, args }
      })
      throw error
    }
  }

  /**
   * Execute browser inspection
   */
  async executeBrowserInspect(url: string, headless: boolean = true): Promise<string> {
    try {
      const sessionId = `inspect_${Date.now()}`
      
      // Ensure browser tools are initialized
      if (!this.browserTools.isReady()) {
        await this.browserTools.initialize()
      }
      
      // Create session and navigate
      const createResult = await this.browserTools.createSession(sessionId, url, { headless })
      if (!createResult.success) {
        throw new Error(`Failed to create browser session: ${createResult.error}`)
      }
      
      const navigateResult = await this.browserTools.navigate(sessionId, url)
      if (!navigateResult.success) {
        throw new Error(`Failed to navigate to URL: ${navigateResult.error}`)
      }
      
      // Get page information
      const htmlResult = await this.browserTools.getHTML(sessionId)
      const textResult = await this.browserTools.getText(sessionId)
      
      // Close session
      await this.browserTools.closeSession(sessionId)
      
      const inspectionResult = {
        url,
        sessionId,
        html: htmlResult.success ? htmlResult.data.html : null,
        text: textResult.success ? textResult.data.text : null,
        timestamp: new Date().toISOString()
      }
      
      this.logger.info('Browser inspection completed', {
        module: 'MCPServer',
        operation: 'executeBrowserInspect',
        data: { url, sessionId }
      })
      
      return `Browser inspection for ${url}:\n\n${JSON.stringify(inspectionResult, null, 2)}`
    } catch (error) {
      this.logger.error('Browser inspection failed', {
        module: 'MCPServer',
        operation: 'executeBrowserInspect',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { url }
      })
      throw error
    }
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
  async shutdown(): Promise<void> {
    this.logger.info('🛑 Shutting down MCP Server...', {
      module: 'MCPServer',
      operation: 'shutdown'
    })
    
    try {
      await this.browserTools.shutdown()
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