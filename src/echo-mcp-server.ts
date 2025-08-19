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
// Removed filesystem/system imports per cleanup plan
import { BrowserManager } from './modules/browser/browser-manager.js'
import { PageController } from './modules/browser/page-controller.js'
import { BrowserTools } from './modules/browser/browser-tools.js'
import { DOMInspector } from './modules/browser/dom-inspector.js'
import { JavaScriptExecutor } from './modules/browser/js-executor.js'
import { NetworkMonitor } from './modules/browser/network-monitor.js'
import { ScreenshotService } from './modules/browser/screenshot-service.js'
import { StateManager } from './modules/browser/state-manager.js'
import { BrowserSecurityManager } from './modules/browser/browser-security-manager.js'
import { CDPConnectionManager } from './modules/browser/cdp-connection-manager.js'

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
// Removed filesystem/system schemas per cleanup plan

const BrowserNavigateSchema = z.object({
  sessionId: z.string().describe("Browser session identifier"),
  url: z.string().describe("URL to navigate to"),
  timeout: z.number().optional().describe("Navigation timeout in milliseconds"),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle0", "networkidle2"]).optional()
})

const BrowserBackSchema = z.object({
  sessionId: z.string().describe("Browser session identifier")
})

const BrowserForwardSchema = z.object({
  sessionId: z.string().describe("Browser session identifier")
})

const BrowserRefreshSchema = z.object({
  sessionId: z.string().describe("Browser session identifier"),
  timeout: z.number().optional().describe("Refresh timeout in milliseconds")
})

const BrowserClickSchema = z.object({
  sessionId: z.string().describe("Browser session identifier"),
  selector: z.string().describe("CSS selector for element to click"),
  timeout: z.number().optional().describe("Click timeout in milliseconds")
})

const BrowserFillSchema = z.object({
  sessionId: z.string().describe("Browser session identifier"),
  selector: z.string().describe("CSS selector for input element"),
  value: z.string().describe("Text content to fill"),
  timeout: z.number().optional().describe("Fill timeout in milliseconds")
})

const BrowserSelectSchema = z.object({
  sessionId: z.string().describe("Browser session identifier"),
  selector: z.string().describe("CSS selector for select element"),
  value: z.string().describe("Option value to select"),
  timeout: z.number().optional().describe("Select timeout in milliseconds")
})

const BrowserWaitSchema = z.object({
  sessionId: z.string().describe("Browser session identifier"),
  condition: z.union([
    z.object({ selector: z.string() }),
    z.object({ text: z.string() }),
    z.object({ timeout: z.number() })
  ]).describe("Wait condition"),
  timeout: z.number().optional().describe("Wait timeout in milliseconds")
})

const BrowserScrollSchema = z.object({
  sessionId: z.string().describe("Browser session identifier"),
  selector: z.string().optional().describe("CSS selector for element to scroll"),
  x: z.number().optional().describe("Horizontal scroll amount"),
  y: z.number().optional().describe("Vertical scroll amount")
})

const BrowserExtractSchema = z.object({
  sessionId: z.string().describe("Browser session identifier"),
  selector: z.string().describe("CSS selector for element to extract"),
  attribute: z.string().optional().describe("Attribute to extract")
})

const BrowserScreenshotSchema = z.object({
  sessionId: z.string().describe("Browser session identifier"),
  selector: z.string().optional().describe("CSS selector for element to screenshot"),
  path: z.string().optional().describe("File path to save the screenshot")
})

const BrowserHtmlSchema = z.object({
  sessionId: z.string().describe("Browser session identifier")
})

const BrowserTextSchema = z.object({
  sessionId: z.string().describe("Browser session identifier"),
  selector: z.string().optional().describe("CSS selector for element to extract text from")
})

const BrowserExecuteSchema = z.object({
  sessionId: z.string().describe("Browser session identifier"),
  script: z.string().describe("JavaScript code to execute"),
  args: z.array(z.any()).optional().describe("Arguments to pass to script")
})

const BrowserNetworkSchema = z.object({
  sessionId: z.string().describe("Browser session identifier"),
  action: z.enum(["start", "stop", "get"]).describe("Network monitoring action")
})

const BrowserStateSchema = z.object({
  sessionId: z.string().describe("Browser session identifier"),
  action: z.enum([
    "getCookies",
    "setCookie",
    "deleteCookie",
    "clearCookies",
    "getLocalStorage",
    "setLocalStorageItem",
    "getSessionStorage",
    "setSessionStorageItem"
  ]).describe("State management action"),
  key: z.string().optional().describe("Storage key or cookie name"),
  value: z.string().optional().describe("Storage value or cookie value"),
  domain: z.string().optional().describe("Cookie domain")
})

const BrowserInspectSchema = z.object({
  url: z.string().describe("URL to inspect"),
})

// Removed project analyze schema

// Tool names constants
const ToolName = {
  // Removed non-browser tool names
  BROWSER_NAVIGATE: "browser_navigate",
  BROWSER_BACK: "browser_back",
  BROWSER_FORWARD: "browser_forward",
  BROWSER_REFRESH: "browser_refresh",
  BROWSER_CLICK: "browser_click",
  BROWSER_FILL: "browser_fill",
  BROWSER_SELECT: "browser_select",
  BROWSER_WAIT: "browser_wait",
  BROWSER_SCROLL: "browser_scroll",
  BROWSER_EXTRACT: "browser_extract",
  BROWSER_SCREENSHOT: "browser_screenshot",
  BROWSER_HTML: "browser_html",
  BROWSER_TEXT: "browser_text",
  BROWSER_EXECUTE: "browser_execute",
  BROWSER_NETWORK: "browser_network",
  BROWSER_STATE: "browser_state",
  BROWSER_INSPECT: "browser_inspect",
  BROWSER_FIND_ELEMENT_AI: "browser_find_element_ai",
  BROWSER_GENERATE_SELECTORS: "browser_generate_selectors",
  BROWSER_ANALYZE_PAGE_SEMANTICS: "browser_analyze_page_semantics",
  // Removed project analyze
} as const

class HybridMCPServer {
  private server: Server
  private app: express.Application
  private transports: Map<string, SSEServerTransport> = new Map()
  private logger: any
  private requestCount: number = 0
  private isInitialized: boolean = false
  private startupTime: Date
  private browserSessions: Map<string, any> = new Map()
  private maxSessions: number = 20
  private sessionMemoryLimit: number = 200 * 1024 * 1024
  private navigationTimeout: number = 30000
  private interactionTimeout: number = 5000

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
      this.server = new Server({
        name: "indom-mcp-server",
        version: "1.0.0",
        capabilities: {
          prompts: {},
          tools: {},
        },
      })
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

  private async getBrowserSession(sessionId: string): Promise<any> {
    console.log(`🔧 [SESSION] Getting browser session: ${sessionId}`)
    
    if (this.browserSessions.size >= this.maxSessions && !this.browserSessions.has(sessionId)) {
      console.log(`🔧 [SESSION] Maximum sessions reached, cleaning up old sessions`)
      await this.cleanupOldSessions()
    }
    
    if (this.browserSessions.size >= this.maxSessions && !this.browserSessions.has(sessionId)) {
      throw new Error(`Maximum browser sessions (${this.maxSessions}) reached`)
    }

    if (!this.browserSessions.has(sessionId)) {
      console.log(`🔧 [SESSION] Creating new browser session: ${sessionId}`)
      try {
        const cdpManager = new CDPConnectionManager()
        const browserManager = new BrowserManager()
        
        const session = {
          cdpManager,
          browserManager,
          pageController: new PageController(cdpManager),
          browserTools: new BrowserTools(browserManager),
          domInspector: new DOMInspector(cdpManager),
          jsExecutor: new JavaScriptExecutor(cdpManager),
          networkMonitor: new NetworkMonitor(cdpManager),
          screenshotService: new ScreenshotService(cdpManager),
          stateManager: new StateManager(cdpManager),
          securityManager: new BrowserSecurityManager(),
          createdAt: new Date(),
          memoryUsage: 0
        }
        
        console.log(`🔧 [SESSION] Initializing CDP manager for session: ${sessionId}`)
        await session.cdpManager.initialize()
        console.log(`🔧 [SESSION] Initializing page controller for session: ${sessionId}`)
        await session.pageController.initialize()
        console.log(`🔧 [SESSION] Initializing browser manager for session: ${sessionId}`)
        await session.browserManager.initialize()
        console.log(`🔧 [SESSION] Initializing network monitor for session: ${sessionId}`)
        await session.networkMonitor.initialize()
        console.log(`🔧 [SESSION] Initializing JS executor for session: ${sessionId}`)
        await session.jsExecutor.initialize()
        console.log(`🔧 [SESSION] Initializing screenshot service for session: ${sessionId}`)
        await session.screenshotService.initialize()
        console.log(`🔧 [SESSION] Initializing state manager for session: ${sessionId}`)
        await session.stateManager.initialize()

        console.log(`🔧 [SESSION] Creating state for session: ${sessionId}`)
        await session.stateManager.createSession(sessionId)
        
        this.browserSessions.set(sessionId, session)
        console.log(`✅ [SESSION] Browser session created and stored: ${sessionId}`)
        
        this.logger.info(`✅ [BROWSER_SESSION] Created new browser session: ${sessionId}`, {
          module: 'HybridMCPServer',
          operation: 'getBrowserSession',
          sessionId
        })
      } catch (error) {
        console.error(`❌ [SESSION] Failed to create browser session: ${sessionId}`, error)
        this.logger.error(`❌ [BROWSER_SESSION] Failed to create browser session: ${sessionId}`, {
          module: 'HybridMCPServer',
          operation: 'getBrowserSession',
          sessionId,
          error: error instanceof Error ? error : new Error(String(error))
        })
        throw new Error(`Failed to create browser session ${sessionId}: ${error}`)
      }
    } else {
      console.log(`✅ [SESSION] Using existing browser session: ${sessionId}`)
    }

    const session = this.browserSessions.get(sessionId)
    console.log(`🔧 [SESSION] Checking page state for session: ${sessionId}`)
    
    try {
      if (!session.pageController.getPageState(sessionId)) {
        console.log(`🔧 [SESSION] Creating page for session: ${sessionId}`)
        await session.pageController.createPage(sessionId)
        console.log(`✅ [SESSION] Page created for session: ${sessionId}`)
        
        console.log(`🔧 [SESSION] Starting network monitoring for session: ${sessionId}`)
        await session.networkMonitor.startMonitoring(sessionId)
        console.log(`✅ [SESSION] Network monitoring started for session: ${sessionId}`)
        
        this.logger.info(`✅ [PAGE_CREATED] Created page for session: ${sessionId}`, {
          module: 'HybridMCPServer',
          operation: 'getBrowserSession',
          sessionId
        })
      } else {
        console.log(`✅ [SESSION] Page state already exists for session: ${sessionId}`)
      }
    } catch (error) {
      console.error(`❌ [SESSION] Failed to create page for session: ${sessionId}`, error)
      this.logger.error(`❌ [PAGE_CREATION] Failed to create page for session: ${sessionId}`, {
        module: 'HybridMCPServer',
        operation: 'getBrowserSession',
        sessionId,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to create page for session ${sessionId}: ${error}`)
    }
    
    console.log(`✅ [SESSION] Returning browser session: ${sessionId}`)
    return session
  }

  private async cleanupOldSessions(): Promise<void> {
    const sessions = Array.from(this.browserSessions.entries())
    const now = new Date()
    const maxAge = 30 * 60 * 1000 // 30 minutes
    
    for (const [sessionId, session] of sessions) {
      const age = now.getTime() - session.createdAt.getTime()
      if (age > maxAge) {
        console.log(`🔧 [SESSION] Cleaning up old session: ${sessionId}`)
        try {
          await session.cdpManager.closeAllConnections()
          this.browserSessions.delete(sessionId)
          console.log(`✅ [SESSION] Cleaned up session: ${sessionId}`)
        } catch (error) {
          console.error(`❌ [SESSION] Failed to cleanup session: ${sessionId}`, error)
        }
      }
    }
  }

  private validateUrl(url: string): void {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new Error('Invalid URL: must start with http:// or https://')
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
            name: ToolName.BROWSER_NAVIGATE,
            description: "Navigate to URL with timeout and wait conditions",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "Browser session identifier",
                },
                url: {
                  type: "string",
                  description: "URL to navigate to",
                },
                timeout: {
                  type: "number",
                  description: "Navigation timeout in milliseconds",
                },
                waitUntil: {
                  type: "string",
                  description: "Wait condition",
                },
              },
              required: ["sessionId", "url"],
            },
          },
          {
            name: ToolName.BROWSER_FIND_ELEMENT_AI,
            description: "Find element using AI-powered natural language description",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: { type: "string", description: "Browser session identifier" },
                description: { type: "string", description: "Natural language description" },
                context: { type: "object", description: "Optional search context", additionalProperties: true },
              },
              required: ["sessionId", "description"],
            },
          },
          {
            name: ToolName.BROWSER_GENERATE_SELECTORS,
            description: "Generate multiple robust selectors for an element",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: { type: "string", description: "Browser session identifier" },
                elementSelector: { type: "string", description: "Initial CSS selector" },
              },
              required: ["sessionId", "elementSelector"],
            },
          },
          {
            name: ToolName.BROWSER_ANALYZE_PAGE_SEMANTICS,
            description: "Analyze page structure and element relationships",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: { type: "string", description: "Browser session identifier" },
              },
              required: ["sessionId"],
            },
          },
          {
            name: ToolName.BROWSER_BACK,
            description: "Navigate back in browser history",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "Browser session identifier",
                },
              },
              required: ["sessionId"],
            },
          },
          {
            name: ToolName.BROWSER_FORWARD,
            description: "Navigate forward in browser history",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "Browser session identifier",
                },
              },
              required: ["sessionId"],
            },
          },
          {
            name: ToolName.BROWSER_REFRESH,
            description: "Refresh current page",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "Browser session identifier",
                },
                timeout: {
                  type: "number",
                  description: "Refresh timeout in milliseconds",
                },
              },
              required: ["sessionId"],
            },
          },
          {
            name: ToolName.BROWSER_CLICK,
            description: "Click elements by CSS selector with timeout",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "Browser session identifier",
                },
                selector: {
                  type: "string",
                  description: "CSS selector for element to click",
                },
                timeout: {
                  type: "number",
                  description: "Click timeout in milliseconds",
                },
              },
              required: ["sessionId", "selector"],
            },
          },
          {
            name: ToolName.BROWSER_FILL,
            description: "Fill form inputs with text content",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "Browser session identifier",
                },
                selector: {
                  type: "string",
                  description: "CSS selector for input element",
                },
                value: {
                  type: "string",
                  description: "Text content to fill",
                },
                timeout: {
                  type: "number",
                  description: "Fill timeout in milliseconds",
                },
              },
              required: ["sessionId", "selector", "value"],
            },
          },
          {
            name: ToolName.BROWSER_SELECT,
            description: "Select dropdown options by value",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "Browser session identifier",
                },
                selector: {
                  type: "string",
                  description: "CSS selector for select element",
                },
                value: {
                  type: "string",
                  description: "Option value to select",
                },
                timeout: {
                  type: "number",
                  description: "Select timeout in milliseconds",
                },
              },
              required: ["sessionId", "selector", "value"],
            },
          },
          {
            name: ToolName.BROWSER_WAIT,
            description: "Wait for elements or conditions to be met",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "Browser session identifier",
                },
                condition: {
                  type: "object",
                  description: "Wait condition",
                  additionalProperties: true,
                },
                timeout: {
                  type: "number",
                  description: "Wait timeout in milliseconds",
                },
              },
              required: ["sessionId", "condition"],
            },
          },
          {
            name: ToolName.BROWSER_SCROLL,
            description: "Scroll page or specific elements",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "Browser session identifier",
                },
                selector: {
                  type: "string",
                  description: "CSS selector for element to scroll",
                },
                x: {
                  type: "number",
                  description: "Horizontal scroll amount",
                },
                y: {
                  type: "number",
                  description: "Vertical scroll amount",
                },
              },
              required: ["sessionId"],
            },
          },
          {
            name: ToolName.BROWSER_EXTRACT,
            description: "Extract content from DOM elements",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "Browser session identifier",
                },
                selector: {
                  type: "string",
                  description: "CSS selector for element to extract",
                },
                attribute: {
                  type: "string",
                  description: "Attribute to extract",
                },
              },
              required: ["sessionId", "selector"],
            },
          },
          {
            name: ToolName.BROWSER_SCREENSHOT,
            description: "Capture full-page or element screenshots and return base64-encoded image data with metadata",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "Browser session identifier",
                },
                selector: {
                  type: "string",
                  description: "CSS selector for element to screenshot",
                },

                path: {
                  type: "string",
                  description: "File path to save the screenshot",
                },
              },
              required: ["sessionId"],
            },
          },
          {
            name: ToolName.BROWSER_HTML,
            description: "Get complete page HTML content",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "Browser session identifier",
                },
              },
              required: ["sessionId"],
            },
          },
          {
            name: ToolName.BROWSER_TEXT,
            description: "Extract text content from elements",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "Browser session identifier",
                },
                selector: {
                  type: "string",
                  description: "CSS selector for element to extract text from",
                },
              },
              required: ["sessionId"],
            },
          },
          {
            name: ToolName.BROWSER_EXECUTE,
            description: "Execute JavaScript code in browser context",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "Browser session identifier",
                },
                script: {
                  type: "string",
                  description: "JavaScript code to execute",
                },
                args: {
                  type: "array",
                  description: "Arguments to pass to script",
                  items: {},
                },
              },
              required: ["sessionId", "script"],
            },
          },
          {
            name: ToolName.BROWSER_NETWORK,
            description: "Monitor network requests and responses",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "Browser session identifier",
                },
                action: {
                  type: "string",
                  description: "Network monitoring action",
                },
              },
              required: ["sessionId", "action"],
            },
          },
          {
            name: ToolName.BROWSER_STATE,
            description: "Manage cookies and browser storage",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "Browser session identifier",
                },
                action: {
                  type: "string",
                  description: "State management action",
                },
                key: {
                  type: "string",
                  description: "Storage key",
                },
                value: {
                  type: "string",
                  description: "Storage value",
                },
                domain: {
                  type: "string",
                  description: "Cookie domain",
                },
              },
              required: ["sessionId", "action"],
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
        let result: string | object
        console.log(`🔧 [${new Date().toISOString()}] [REQ-${requestId}] Executing tool: ${name}`)

        switch (name) {
          // Removed non-browser tools

          case ToolName.BROWSER_NAVIGATE:
            console.log(`🌐 [${new Date().toISOString()}] [REQ-${requestId}] Executing browserNavigate tool`)
            const navigateArgs = BrowserNavigateSchema.parse(args)
            result = await this.browserNavigate(navigateArgs)
            break

          case ToolName.BROWSER_BACK:
            console.log(`⬅️ [${new Date().toISOString()}] [REQ-${requestId}] Executing browserBack tool`)
            const backArgs = BrowserBackSchema.parse(args)
            result = await this.browserBack(backArgs)
            break

          case ToolName.BROWSER_FORWARD:
            console.log(`➡️ [${new Date().toISOString()}] [REQ-${requestId}] Executing browserForward tool`)
            const forwardArgs = BrowserForwardSchema.parse(args)
            result = await this.browserForward(forwardArgs)
            break

          case ToolName.BROWSER_REFRESH:
            console.log(`🔄 [${new Date().toISOString()}] [REQ-${requestId}] Executing browserRefresh tool`)
            const refreshArgs = BrowserRefreshSchema.parse(args)
            result = await this.browserRefresh(refreshArgs)
            break

          case ToolName.BROWSER_CLICK:
            console.log(`🖱️ [${new Date().toISOString()}] [REQ-${requestId}] Executing browserClick tool`)
            const clickArgs = BrowserClickSchema.parse(args)
            result = await this.browserClick(clickArgs)
            break

          case ToolName.BROWSER_FILL:
            console.log(`📝 [${new Date().toISOString()}] [REQ-${requestId}] Executing browserFill tool`)
            const fillArgs = BrowserFillSchema.parse(args)
            result = await this.browserFill(fillArgs)
            break

          case ToolName.BROWSER_SELECT:
            console.log(`📋 [${new Date().toISOString()}] [REQ-${requestId}] Executing browserSelect tool`)
            const selectArgs = BrowserSelectSchema.parse(args)
            result = await this.browserSelect(selectArgs)
            break

          case ToolName.BROWSER_WAIT:
            console.log(`⏳ [${new Date().toISOString()}] [REQ-${requestId}] Executing browserWait tool`)
            const waitArgs = BrowserWaitSchema.parse(args)
            result = await this.browserWait(waitArgs)
            break

          case ToolName.BROWSER_SCROLL:
            console.log(`📜 [${new Date().toISOString()}] [REQ-${requestId}] Executing browserScroll tool`)
            const scrollArgs = BrowserScrollSchema.parse(args)
            result = await this.browserScroll(scrollArgs)
            break

          case ToolName.BROWSER_EXTRACT:
            console.log(`🔍 [${new Date().toISOString()}] [REQ-${requestId}] Executing browserExtract tool`)
            const extractArgs = BrowserExtractSchema.parse(args)
            result = await this.browserExtract(extractArgs)
            break

          case ToolName.BROWSER_SCREENSHOT:
            console.log(`📸 [${new Date().toISOString()}] [REQ-${requestId}] Executing browserScreenshot tool`)
            const screenshotArgs = BrowserScreenshotSchema.parse(args)
            result = await this.browserScreenshot(screenshotArgs)
            break

          case ToolName.BROWSER_HTML:
            console.log(`📄 [${new Date().toISOString()}] [REQ-${requestId}] Executing browserHtml tool`)
            const htmlArgs = BrowserHtmlSchema.parse(args)
            result = await this.browserHtml(htmlArgs)
            break

          case ToolName.BROWSER_TEXT:
            console.log(`📝 [${new Date().toISOString()}] [REQ-${requestId}] Executing browserText tool`)
            const textArgs = BrowserTextSchema.parse(args)
            result = await this.browserText(textArgs)
            break

          case ToolName.BROWSER_EXECUTE:
            console.log(`⚡ [${new Date().toISOString()}] [REQ-${requestId}] Executing browserExecute tool`)
            const executeArgs = BrowserExecuteSchema.parse(args)
            result = await this.browserExecute(executeArgs)
            break

          case ToolName.BROWSER_NETWORK:
            console.log(`🌐 [${new Date().toISOString()}] [REQ-${requestId}] Executing browserNetwork tool`)
            const networkArgs = BrowserNetworkSchema.parse(args)
            result = await this.browserNetwork(networkArgs)
            break

          case ToolName.BROWSER_STATE:
            console.log(`💾 [${new Date().toISOString()}] [REQ-${requestId}] Executing browserState tool`)
            const stateArgs = BrowserStateSchema.parse(args)
            result = await this.browserState(stateArgs)
            break

          case ToolName.BROWSER_INSPECT:
            console.log(`🔍 [${new Date().toISOString()}] [REQ-${requestId}] Executing inspectBrowser tool`)
            const browserArgs = BrowserInspectSchema.parse(args)
            result = await this.inspectBrowser(browserArgs.url)
            break

          case ToolName.BROWSER_FIND_ELEMENT_AI:
            {
              const schema = z.object({ sessionId: z.string(), description: z.string(), context: z.any().optional() })
              const a = schema.parse(args)
              const session = await this.getBrowserSession(a.sessionId)
              const found = await session.browserManager.findElementByDescription(a.sessionId, a.description, a.context)
              result = `AI element match: ${JSON.stringify(found, null, 2)}`
            }
            break

          case ToolName.BROWSER_GENERATE_SELECTORS:
            {
              const schema = z.object({ sessionId: z.string(), elementSelector: z.string() })
              const a = schema.parse(args)
              const session = await this.getBrowserSession(a.sessionId)
              const strategies = await session.browserManager.generateRobustSelectors(a.sessionId, a.elementSelector)
              result = `AI selector strategies: ${JSON.stringify(strategies, null, 2)}`
            }
            break

          case ToolName.BROWSER_ANALYZE_PAGE_SEMANTICS:
            {
              const schema = z.object({ sessionId: z.string() })
              const a = schema.parse(args)
              const session = await this.getBrowserSession(a.sessionId)
              const map = await session.browserManager.analyzePageSemanticsAI(a.sessionId)
              result = `Page semantic map: ${JSON.stringify(map, null, 2)}`
            }
            break

          // Removed project analyze tool

          default:
            const errorMsg = `Unknown tool: ${name}`
            console.error(`❌ [${new Date().toISOString()}] [REQ-${requestId}] ${errorMsg}`)
            throw new Error(errorMsg)
        }

        // Convert object results to JSON string for consistent handling
        const resultString = typeof result === 'object' ? JSON.stringify(result) : result
        
        console.log(`✅ [${new Date().toISOString()}] [REQ-${requestId}] Tool execution successful: ${name}`)
        console.log(`📊 [${new Date().toISOString()}] [REQ-${requestId}] Result length: ${resultString.length} characters`)
        
        this.logger.info(`✅ [REQ-${requestId}] Tool execution successful: ${name}`, {
          module: 'HybridMCPServer',
          operation: 'handleToolCall',
          requestId,
          toolName: name,
          resultLength: resultString.length,
          resultPreview: resultString.substring(0, 200) + (resultString.length > 200 ? '...' : '')
        })

        return {
          content: [
            {
              type: "text",
              text: resultString,
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
    this.app.post("/message", async (req, res): Promise<void> => {
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
          res.status(404).json({ error: "Session not found" })
          return
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

// Removed non-browser helper methods (filesystem, system, project analysis)
  /* async readFile(filePath: string): Promise<string> {
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
  } */

  /* async writeFile(filePath: string, content: string): Promise<string> {
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
  } */

  /* async listDirectory(dirPath: string): Promise<string> {
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
  } */

  /* async getSystemInfo(): Promise<string> {
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
  } */

  /* async getMCPStatus(): Promise<string> {
    const timestamp = new Date().toISOString()
    console.log(`📊 [${timestamp}] Getting MCP server status`)
    
    const status = {
      serverName: "indom-mcp-server",
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
  } */

  async browserNavigate(args: z.infer<typeof BrowserNavigateSchema>): Promise<string> {
    const sessionId = args.sessionId
    const url = args.url
    const timeout = args.timeout || this.navigationTimeout
    const waitUntil = args.waitUntil || "load"

    console.log(`🔧 [NAVIGATE] Starting browser navigation for session: ${sessionId}`)

    this.logger.info(`🌐 [BROWSER_NAVIGATE] Navigating to ${url} with timeout ${timeout}ms and waitUntil ${waitUntil}`, {
      module: 'HybridMCPServer',
      operation: 'browserNavigate',
      sessionId,
      url,
      timeout,
      waitUntil
    })

    try {
      console.log(`🔧 [NAVIGATE] Getting browser session for: ${sessionId}`)
      const session = await this.getBrowserSession(sessionId)
      console.log(`✅ [NAVIGATE] Got browser session for: ${sessionId}`)
      
      console.log(`🔧 [NAVIGATE] Calling navigateToUrl for: ${sessionId}`)
      await session.pageController.navigateToUrl(sessionId, url, { timeout, waitUntil })
      console.log(`✅ [NAVIGATE] Navigation completed for: ${sessionId}`)
      
      return `Successfully navigated to ${url} in session ${sessionId}`
    } catch (error) {
      console.error(`❌ [NAVIGATE] Browser navigation failed for session: ${sessionId}`, error)
      this.logger.error(`❌ [BROWSER_NAVIGATE] Browser navigation failed`, {
        module: 'HybridMCPServer',
        operation: 'browserNavigate',
        sessionId,
        url,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to navigate to ${url} in session ${sessionId}: ${error}`)
    }
  }

  async browserBack(args: z.infer<typeof BrowserBackSchema>): Promise<string> {
    const sessionId = args.sessionId
    this.logger.info(`⬅️ [BROWSER_BACK] Navigating back in browser history for session ${sessionId}`, {
      module: 'HybridMCPServer',
      operation: 'browserBack',
      sessionId
    })

    try {
      const session = await this.getBrowserSession(sessionId)
      await session.pageController.goBack(sessionId)
      return `Successfully navigated back in browser history for session ${sessionId}`
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Browser back navigation failed:`, error)
      this.logger.error(`❌ [BROWSER_BACK] Browser back navigation failed`, {
        module: 'HybridMCPServer',
        operation: 'browserBack',
        sessionId,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to navigate back in browser history for session ${sessionId}: ${error}`)
    }
  }

  async browserForward(args: z.infer<typeof BrowserForwardSchema>): Promise<string> {
    const sessionId = args.sessionId
    this.logger.info(`➡️ [BROWSER_FORWARD] Navigating forward in browser history for session ${sessionId}`, {
      module: 'HybridMCPServer',
      operation: 'browserForward',
      sessionId
    })

    try {
      const session = await this.getBrowserSession(sessionId)
      await session.pageController.goForward(sessionId)
      return `Successfully navigated forward in browser history for session ${sessionId}`
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Browser forward navigation failed:`, error)
      this.logger.error(`❌ [BROWSER_FORWARD] Browser forward navigation failed`, {
        module: 'HybridMCPServer',
        operation: 'browserForward',
        sessionId,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to navigate forward in browser history for session ${sessionId}: ${error}`)
    }
  }

  async browserRefresh(args: z.infer<typeof BrowserRefreshSchema>): Promise<string> {
    const sessionId = args.sessionId
    const timeout = args.timeout || this.navigationTimeout
    this.logger.info(`🔄 [BROWSER_REFRESH] Refreshing current page for session ${sessionId} with timeout ${timeout}ms`, {
      module: 'HybridMCPServer',
      operation: 'browserRefresh',
      sessionId,
      timeout
    })

    try {
      const session = await this.getBrowserSession(sessionId)
      await session.pageController.refresh(sessionId)
      return `Successfully refreshed current page for session ${sessionId}`
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Browser refresh failed:`, error)
      this.logger.error(`❌ [BROWSER_REFRESH] Browser refresh failed`, {
        module: 'HybridMCPServer',
        operation: 'browserRefresh',
        sessionId,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to refresh current page for session ${sessionId}: ${error}`)
    }
  }

  async browserClick(args: z.infer<typeof BrowserClickSchema>): Promise<string> {
    const sessionId = args.sessionId
    const selector = args.selector
    const timeout = args.timeout || this.interactionTimeout
    this.logger.info(`🖱️ [BROWSER_CLICK] Clicking element with selector ${selector} for session ${sessionId} with timeout ${timeout}ms`, {
      module: 'HybridMCPServer',
      operation: 'browserClick',
      sessionId,
      selector,
      timeout
    })

    try {
      const session = await this.getBrowserSession(sessionId)
      await session.pageController.clickElement(sessionId, selector, { timeout })
      return `Successfully clicked element with selector ${selector} for session ${sessionId}`
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Browser click failed:`, error)
      this.logger.error(`❌ [BROWSER_CLICK] Browser click failed`, {
        module: 'HybridMCPServer',
        operation: 'browserClick',
        sessionId,
        selector,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to click element with selector ${selector} for session ${sessionId}: ${error}`)
    }
  }

  async browserFill(args: z.infer<typeof BrowserFillSchema>): Promise<string> {
    const sessionId = args.sessionId
    const selector = args.selector
    const value = args.value
    const timeout = args.timeout || this.interactionTimeout
    this.logger.info(`📝 [BROWSER_FILL] Filling input with selector ${selector} for session ${sessionId} with value ${value} and timeout ${timeout}ms`, {
      module: 'HybridMCPServer',
      operation: 'browserFill',
      sessionId,
      selector,
      value,
      timeout
    })

    try {
      const session = await this.getBrowserSession(sessionId)
      await session.pageController.fillElement(sessionId, selector, value, { timeout })
      return `Successfully filled input with selector ${selector} for session ${sessionId}`
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Browser fill failed:`, error)
      this.logger.error(`❌ [BROWSER_FILL] Browser fill failed`, {
        module: 'HybridMCPServer',
        operation: 'browserFill',
        sessionId,
        selector,
        value,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to fill input with selector ${selector} for session ${sessionId}: ${error}`)
    }
  }

  async browserSelect(args: z.infer<typeof BrowserSelectSchema>): Promise<string> {
    const sessionId = args.sessionId
    const selector = args.selector
    const value = args.value
    const timeout = args.timeout || this.interactionTimeout
    this.logger.info(`📋 [BROWSER_SELECT] Selecting option with selector ${selector} for session ${sessionId} with value ${value} and timeout ${timeout}ms`, {
      module: 'HybridMCPServer',
      operation: 'browserSelect',
      sessionId,
      selector,
      value,
      timeout
    })

    try {
      const session = await this.getBrowserSession(sessionId)
      await session.pageController.selectOption(sessionId, selector, value, { timeout })
      return `Successfully selected option with selector ${selector} for session ${sessionId}`
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Browser select failed:`, error)
      this.logger.error(`❌ [BROWSER_SELECT] Browser select failed`, {
        module: 'HybridMCPServer',
        operation: 'browserSelect',
        sessionId,
        selector,
        value,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to select option with selector ${selector} for session ${sessionId}: ${error}`)
    }
  }

  async browserWait(args: z.infer<typeof BrowserWaitSchema>): Promise<string> {
    const sessionId = args.sessionId
    const condition = args.condition
    const timeout = args.timeout || this.interactionTimeout
    this.logger.info(`⏳ [BROWSER_WAIT] Waiting for condition in session ${sessionId} with timeout ${timeout}ms`, {
      module: 'HybridMCPServer',
      operation: 'browserWait',
      sessionId,
      condition,
      timeout
    })

    try {
      const session = await this.getBrowserSession(sessionId)
      if ('selector' in condition) {
        await session.pageController.waitForElement(sessionId, condition.selector, { timeout })
        return `Successfully waited for selector in session ${sessionId}`
      }
      if ('text' in condition) {
        const start = Date.now()
        while (Date.now() - start < timeout) {
          try {
            const matches = await session.domInspector.searchElements(sessionId, { textContent: condition.text })
            if (Array.isArray(matches) && matches.length > 0) {
              return `Successfully waited for text in session ${sessionId}`
            }
          } catch {}
          await new Promise(r => setTimeout(r, 100))
        }
        throw new Error(`Text "${condition.text}" not found within timeout`)
      }
      throw new Error('Invalid wait condition')
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Browser wait failed:`, error)
      this.logger.error(`❌ [BROWSER_WAIT] Browser wait failed`, {
        module: 'HybridMCPServer',
        operation: 'browserWait',
        sessionId,
        condition,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to wait for condition in session ${sessionId}: ${error}`)
    }
  }

  async browserScroll(args: z.infer<typeof BrowserScrollSchema>): Promise<string> {
    const sessionId = args.sessionId
    const selector = args.selector
    const x = args.x || 0
    const y = args.y || 0
    this.logger.info(`📜 [BROWSER_SCROLL] Scrolling in session ${sessionId} with selector ${selector} and offsets (${x}, ${y})`, {
      module: 'HybridMCPServer',
      operation: 'browserScroll',
      sessionId,
      selector,
      x,
      y
    })

    try {
      const session = await this.getBrowserSession(sessionId)
      await session.pageController.scrollTo(sessionId, x, y)
      return `Successfully scrolled in session ${sessionId}`
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Browser scroll failed:`, error)
      this.logger.error(`❌ [BROWSER_SCROLL] Browser scroll failed`, {
        module: 'HybridMCPServer',
        operation: 'browserScroll',
        sessionId,
        selector,
        x,
        y,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to scroll in session ${sessionId}: ${error}`)
    }
  }

  async browserExtract(args: z.infer<typeof BrowserExtractSchema>): Promise<string> {
    const sessionId = args.sessionId
    const selector = args.selector
    const attribute = args.attribute
    this.logger.info(`🔍 [BROWSER_EXTRACT] Extracting attribute ${attribute} from element with selector ${selector} for session ${sessionId}`, {
      module: 'HybridMCPServer',
      operation: 'browserExtract',
      sessionId,
      selector,
      attribute
    })

    try {
      const session = await this.getBrowserSession(sessionId)
      const element = await session.domInspector.querySelector(sessionId, selector)
      if (!element) {
        throw new Error(`Element with selector ${selector} not found`)
      }
      
      const attr = element.attributes.find((attr: { name: string; value: string }) => attr.name === attribute)
      const result = attr ? attr.value : null
      return `Successfully extracted attribute ${attribute} from element with selector ${selector} for session ${sessionId}: ${result}`
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Browser extract failed:`, error)
      this.logger.error(`❌ [BROWSER_EXTRACT] Browser extract failed`, {
        module: 'HybridMCPServer',
        operation: 'browserExtract',
        sessionId,
        selector,
        attribute,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to extract attribute ${attribute} from element with selector ${selector} for session ${sessionId}: ${error}`)
    }
  }

  async browserScreenshot(args: z.infer<typeof BrowserScreenshotSchema>): Promise<object> {
    const sessionId = args.sessionId
    const selector = args.selector
    const path = args.path
    this.logger.info(`📸 [BROWSER_SCREENSHOT] Taking screenshot in session ${sessionId} with selector ${selector}, path=${path}`, {
      module: 'HybridMCPServer',
      operation: 'browserScreenshot',
      sessionId,
      selector,
      path
    })

    try {
      const session = await this.getBrowserSession(sessionId)
      let screenshotResult
      
      const options = { path, encoding: 'base64' }
      
      if (selector) {
        screenshotResult = await session.screenshotService.captureElementScreenshot(sessionId, selector, options)
      } else {
        screenshotResult = await session.screenshotService.captureScreenshot(sessionId, options)
      }
      
      // Convert binary data to base64 if it's not already encoded
      const screenshotData = typeof screenshotResult.data === 'string' 
        ? screenshotResult.data 
        : screenshotResult.data.toString('base64')
      
      const result = {
        success: true,
        screenshot: screenshotData,
        metadata: {
          sessionId,
          selector,
          format: screenshotResult.format,
          size: screenshotResult.size,
          dimensions: screenshotResult.dimensions,
          timestamp: screenshotResult.timestamp,
          path: screenshotResult.path
        }
      }
      
      this.logger.info(`📸 [BROWSER_SCREENSHOT] Screenshot captured successfully`, {
        module: 'HybridMCPServer',
        operation: 'browserScreenshot',
        sessionId,
        selector,
        size: screenshotResult.size,
        dimensions: screenshotResult.dimensions
      })
      
      return result
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Browser screenshot failed:`, error)
      this.logger.error(`❌ [BROWSER_SCREENSHOT] Browser screenshot failed`, {
        module: 'HybridMCPServer',
        operation: 'browserScreenshot',
        sessionId,
        selector,
        path,
        error: error instanceof Error ? error : new Error(String(error))
      })
      
      return {
        success: false,
        error: `Failed to take screenshot in session ${sessionId}: ${error}`,
        metadata: {
          sessionId,
          selector,
          path
        }
      }
    }
  }

  async browserHtml(args: z.infer<typeof BrowserHtmlSchema>): Promise<string> {
    const sessionId = args.sessionId
    this.logger.info(`📄 [BROWSER_HTML] Getting complete page HTML for session ${sessionId}`, {
      module: 'HybridMCPServer',
      operation: 'browserHtml',
      sessionId
    })

    try {
      const session = await this.getBrowserSession(sessionId)
      const document = await session.domInspector.getDocument(sessionId)
      const html = JSON.stringify(document, null, 2)
      return `Successfully retrieved complete page HTML for session ${sessionId}: ${html.length} characters`
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Browser HTML failed:`, error)
      this.logger.error(`❌ [BROWSER_HTML] Browser HTML failed`, {
        module: 'HybridMCPServer',
        operation: 'browserHtml',
        sessionId,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to get complete page HTML for session ${sessionId}: ${error}`)
    }
  }

  async browserText(args: z.infer<typeof BrowserTextSchema>): Promise<string> {
    const sessionId = args.sessionId
    const selector = args.selector
    this.logger.info(`📝 [BROWSER_TEXT] Extracting text content from element with selector ${selector} for session ${sessionId}`, {
      module: 'HybridMCPServer',
      operation: 'browserText',
      sessionId,
      selector
    })

    try {
      const session = await this.getBrowserSession(sessionId)
      const element = await session.domInspector.querySelector(sessionId, selector)
      if (!element) {
        throw new Error(`Element with selector ${selector} not found`)
      }
      
      const text = element.nodeValue || ''
      return `Successfully extracted text content from element with selector ${selector} for session ${sessionId}: ${text}`
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Browser text extraction failed:`, error)
      this.logger.error(`❌ [BROWSER_TEXT] Browser text extraction failed`, {
        module: 'HybridMCPServer',
        operation: 'browserText',
        sessionId,
        selector,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to extract text content from element with selector ${selector} for session ${sessionId}: ${error}`)
    }
  }

  async browserExecute(args: z.infer<typeof BrowserExecuteSchema>): Promise<string> {
    const sessionId = args.sessionId
    const script = args.script
    const argsArray = args.args || []
    this.logger.info(`⚡ [BROWSER_EXECUTE] Executing JavaScript code in session ${sessionId} with script: ${script} and args: ${JSON.stringify(argsArray)}`, {
      module: 'HybridMCPServer',
      operation: 'browserExecute',
      sessionId,
      script,
      args: argsArray
    })

    try {
      const session = await this.getBrowserSession(sessionId)
      const result = await session.jsExecutor.executeScript(sessionId, script, { args: argsArray })
      return `Successfully executed JavaScript code in session ${sessionId}: ${JSON.stringify(result.result)}`
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Browser execute failed:`, error)
      this.logger.error(`❌ [BROWSER_EXECUTE] Browser execute failed`, {
        module: 'HybridMCPServer',
        operation: 'browserExecute',
        sessionId,
        script,
        args: argsArray,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to execute JavaScript code in session ${sessionId}: ${error}`)
    }
  }

  async browserNetwork(args: z.infer<typeof BrowserNetworkSchema>): Promise<string> {
    const sessionId = args.sessionId
    const action = args.action
    this.logger.info(`🌐 [BROWSER_NETWORK] Managing network monitoring action ${action} for session ${sessionId}`, {
      module: 'HybridMCPServer',
      operation: 'browserNetwork',
      sessionId,
      action
    })

    try {
      const session = await this.getBrowserSession(sessionId)
      if (action === "start") {
        await session.networkMonitor.start();
        return `Successfully started network monitoring for session ${sessionId}`;
      } else if (action === "stop") {
        await session.networkMonitor.stop();
        return `Successfully stopped network monitoring for session ${sessionId}`;
      } else if (action === "get") {
        const requests = await session.networkMonitor.getRequests();
        return `Successfully retrieved ${requests.length} network requests for session ${sessionId}: ${JSON.stringify(requests, null, 2)}`;
      }
      return `Unknown network action: ${action}`;
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Browser network failed:`, error)
      this.logger.error(`❌ [BROWSER_NETWORK] Browser network failed`, {
        module: 'HybridMCPServer',
        operation: 'browserNetwork',
        sessionId,
        action,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to manage network monitoring for session ${sessionId}: ${error}`)
    }
  }

  async browserState(args: z.infer<typeof BrowserStateSchema>): Promise<string> {
    const sessionId = args.sessionId
    const action = args.action
    const key = args.key
    const value = args.value
    const domain = args.domain
    this.logger.info(`💾 [BROWSER_STATE] Managing browser state action ${action} for session ${sessionId} with key=${key}, value=${value}, domain=${domain}`, {
      module: 'HybridMCPServer',
      operation: 'browserState',
      sessionId,
      action,
      key,
      value,
      domain
    })

    try {
      const session = await this.getBrowserSession(sessionId)
      if (action === "getCookies") {
        const cookies = await session.stateManager.getCookies(sessionId, domain);
        return `Successfully retrieved ${cookies.length} cookies for session ${sessionId}: ${JSON.stringify(cookies, null, 2)}`;
      } else if (action === "setCookie") {
        if (!key || !value) throw new Error("Cookie name and value are required")
        await session.stateManager.setCookie(sessionId, { name: key, value, domain });
        return `Successfully set cookie for session ${sessionId} with key=${key}, value=${value}, domain=${domain}`;
      } else if (action === "deleteCookie") {
        if (!key) throw new Error("Cookie name is required")
        await session.stateManager.deleteCookie(sessionId, key, domain);
        return `Successfully deleted cookie ${key} for session ${sessionId}`;
      } else if (action === "clearCookies") {
        const cookies = await session.stateManager.getCookies(sessionId, domain)
        for (const c of cookies) {
          await session.stateManager.deleteCookie(sessionId, c.name, c.domain)
        }
        return `Successfully cleared all cookies for session ${sessionId}`;
      } else if (action === "getLocalStorage") {
        const storage = await session.stateManager.getLocalStorage(sessionId);
        return `Successfully retrieved local storage for session ${sessionId}: ${JSON.stringify(storage, null, 2)}`;
      } else if (action === "setLocalStorageItem") {
        if (!key || !value) throw new Error("Key and value are required")
        await session.stateManager.setLocalStorageItem(sessionId, key, value);
        return `Successfully set local storage item for session ${sessionId} with key=${key}`;
      } else if (action === "getSessionStorage") {
        const storage = await session.stateManager.getSessionStorage(sessionId);
        return `Successfully retrieved session storage for session ${sessionId}: ${JSON.stringify(storage, null, 2)}`;
      } else if (action === "setSessionStorageItem") {
        if (!key || !value) throw new Error("Key and value are required")
        await session.stateManager.setSessionStorageItem(sessionId, key, value);
        return `Successfully set session storage item for session ${sessionId} with key=${key}`;
      }
      return `Unknown state action: ${action}`;
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Browser state failed:`, error)
      this.logger.error(`❌ [BROWSER_STATE] Browser state failed`, {
        module: 'HybridMCPServer',
        operation: 'browserState',
        sessionId,
        action,
        key,
        value,
        domain,
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Failed to manage browser state for session ${sessionId}: ${error}`)
    }
  }

  async inspectBrowser(url: string): Promise<string> {
    const timestamp = new Date().toISOString()
    console.log(`🌐 [${timestamp}] Browser inspection requested for: ${url}`)
    this.logger.info(`🌐 [BROWSER_INSPECT] Browser inspection requested for: ${url}`, { module: 'HybridMCPServer', operation: 'inspectBrowser', url, timestamp })

    const sessionId = `inspect_${Date.now()}`
    try {
      const session = await this.getBrowserSession(sessionId)
      await session.pageController.navigateToUrl(sessionId, url)

      const pageInfo = await session.cdpManager.getPageInfo(sessionId)
      const document = await session.domInspector.getDocument(sessionId)
      const domCount = (function count(el: any): number { let n = 1; if (el.children) for (const c of el.children) n += count(c); return n })(document)
      const security = await session.securityManager.validateContent(document.nodeValue || '')

      return [
        `Inspection for ${url}`,
        `Title: ${pageInfo.title}`,
        `DOM elements: ${domCount}`,
        `Viewport: ${pageInfo.viewport.width}x${pageInfo.viewport.height}`,
        `UA: ${pageInfo.userAgent.substring(0, 60)}...`,
        `Security: ${JSON.stringify(security)}`
      ].join('\n')
    } catch (error) {
      throw error
    } finally {
      try { await (this.browserSessions.get(sessionId)?.cdpManager?.closeAllConnections?.()) } catch {}
      this.browserSessions.delete(sessionId)
    }
  }

  /* async analyzeProject(projectPath: string): Promise<string> {
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
  } */

  public start(port: number = parseInt(process.env.PORT || '3001')) {
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