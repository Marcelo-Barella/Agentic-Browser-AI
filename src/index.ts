#!/usr/bin/env node

/**
 * Agentic AI System - Main Entry Point
 * Coordinates all modules and provides the main interface for the system
 */

import { MCPServer } from './core/mcp-server.js'
// Removed non-browser modules per cleanup plan
import { ErrorHandler } from './core/error-handler.js'
// Removed documentation generator per cleanup plan
import { BrowserManager } from './modules/browser/browser-manager.js'
import { TaskExecutionManager } from './modules/task-execution/index.js'
import { TestingManager } from './modules/testing/index.js'
import { TaskAPI } from './modules/api/task-api.js'
import { RocketshipAdapter } from './modules/rocketship/rocketship-adapter.js'
import { SSEServer, MCPBridge, MCPSSEServer, MCPSSEClient } from './modules/sse/index.js'
import { getLogger } from './core/logger.js'
import { convertHeadlessParameter } from './modules/browser/browser-utils.js'

/**
 * Utility function to automatically inject headless parameter to browser tools
 * Browser tools are identified by having a sessionId parameter
 */
function injectHeadlessParameter(parameters: Record<string, any>): Record<string, any> {
  // Check if this is a browser tool by looking for sessionId parameter
  const isBrowserTool = Object.keys(parameters).some(key => key === 'sessionId')
  
  if (isBrowserTool && !parameters.hasOwnProperty('headless')) {
    return {
      ...parameters,
      headless: { type: 'boolean', required: false }
    }
  }
  
  return parameters
}

/**
 * Enhanced registerTool method that automatically injects headless parameter for browser tools
 */
async function registerBrowserTool(mcpServer: MCPServer, tool: any): Promise<void> {
  const enhancedTool = {
    ...tool,
    parameters: injectHeadlessParameter(tool.parameters)
  }
  await mcpServer.registerTool(enhancedTool)
}

export class AgenticAISystem {
  private _mcpServer: MCPServer

  get mcpServer(): MCPServer {
    return this._mcpServer
  }

  /**
   * Get the MCP server instance
   */
  getMCPServer(): MCPServer {
    return this._mcpServer
  }
  // Removed: projectAnalyzer, fileSystemManager
  private errorHandler: ErrorHandler
  // Removed: documentationGenerator
  private browserManager: BrowserManager
  private taskExecutionManager: TaskExecutionManager
  private taskAPI: TaskAPI
  private rocketshipAdapter: RocketshipAdapter
  private sseServer: SSEServer
  private mcpBridge: MCPBridge
  private mcpSSEServer: MCPSSEServer
  private testingManager: TestingManager
  private isInitialized = false

  constructor() {
    // Initialize core components
    this._mcpServer = new MCPServer()
    this.errorHandler = new ErrorHandler()
    this.browserManager = new BrowserManager()
    
    // Initialize Phase 3 components
    this.taskExecutionManager = new TaskExecutionManager()
    this.testingManager = new TestingManager()
    this.taskAPI = new TaskAPI()
    this.rocketshipAdapter = new RocketshipAdapter()
    
    // Initialize SSE components
    const ssePort = Number(process.env.SSE_SERVER_PORT || process.env.MCP_SSE_BRIDGE_PORT || 3003)
    this.sseServer = new SSEServer({
      port: ssePort,
      corsOrigin: '*',
      maxClients: 100,
      heartbeatInterval: 30000
    })
    this.mcpBridge = new MCPBridge(this.sseServer, this.mcpServer)
    
    // Initialize MCP SSE Server
    const mcpSsePort = Number(process.env.MCP_SERVER_PORT || process.env.MCP_SSE_PORT || 3000)
    this.mcpSSEServer = new MCPSSEServer({
      port: mcpSsePort,
      corsOrigin: '*',
      serverName: 'indom-mcp-server',
      serverVersion: '1.0.0'
    })
  }

  /**
   * Initialize the agentic AI system
   */
  async initialize(): Promise<void> {
    try {
      getLogger().info('🚀 Initializing Agentic AI System...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      getLogger().debug('📋 Debug: Starting component initialization sequence...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })

      // Initialize error handler first
      getLogger().debug('🔧 Debug: Initializing Error Handler...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      await this.errorHandler.initialize()
      getLogger().debug('✅ Debug: Error Handler initialized successfully', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })

      // Initialize MCP server
      getLogger().debug('🔧 Debug: Initializing MCP Server...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      await this._mcpServer.initialize()
      getLogger().debug('✅ Debug: MCP Server initialized successfully', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })

      // Initialize browser manager
      getLogger().debug('🔧 Debug: Initializing Browser Manager...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      try {
        await this.browserManager.initialize()
        getLogger().debug('✅ Debug: Browser Manager initialized successfully', {
          module: 'AgenticAISystem',
          operation: 'initialize'
        })
      } catch (error) {
        getLogger().warn('⚠️ Debug: Browser Manager initialization failed, continuing without browser support', {
          module: 'AgenticAISystem',
          operation: 'initialize',
          error: error instanceof Error ? error : new Error(String(error))
        })
      }

      // Initialize Phase 3 components
      getLogger().debug('🔧 Debug: Initializing Task Execution Manager...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      try {
        await this.taskExecutionManager.initialize()
        getLogger().debug('✅ Debug: Task Execution Manager initialized successfully', {
          module: 'AgenticAISystem',
          operation: 'initialize'
        })
      } catch (error) {
        getLogger().warn('⚠️ Debug: Task Execution Manager initialization failed, continuing without task execution support', {
          module: 'AgenticAISystem',
          operation: 'initialize',
          error: error instanceof Error ? error : new Error(String(error))
        })
      }

      getLogger().debug('🔧 Debug: Initializing Testing Manager...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      try {
        await this.testingManager.initialize()
        getLogger().debug('✅ Debug: Testing Manager initialized successfully', {
          module: 'AgenticAISystem',
          operation: 'initialize'
        })
      } catch (error) {
        getLogger().warn('⚠️ Debug: Testing Manager initialization failed, continuing without testing support', {
          module: 'AgenticAISystem',
          operation: 'initialize',
          error: error instanceof Error ? error : new Error(String(error))
        })
      }

      getLogger().debug('🔧 Debug: Initializing Task API...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      try {
        await this.taskAPI.initialize()
        getLogger().debug('✅ Debug: Task API initialized successfully', {
          module: 'AgenticAISystem',
          operation: 'initialize'
        })
      } catch (error) {
        getLogger().warn('⚠️ Debug: Task API initialization failed, continuing without task API support', {
          module: 'AgenticAISystem',
          operation: 'initialize',
          error: error instanceof Error ? error : new Error(String(error))
        })
      }

      getLogger().debug('🔧 Debug: Initializing Rocketship Adapter...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      try {
        await this.rocketshipAdapter.initialize()
        getLogger().debug('✅ Debug: Rocketship Adapter initialized successfully', {
          module: 'AgenticAISystem',
          operation: 'initialize'
        })
      } catch (error) {
        getLogger().warn('⚠️ Debug: Rocketship Adapter initialization failed, continuing without rocketship support', {
          module: 'AgenticAISystem',
          operation: 'initialize',
          error: error instanceof Error ? error : new Error(String(error))
        })
      }

      // Initialize SSE components
      getLogger().debug('🔧 Debug: Initializing SSE Server...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      try {
        await this.sseServer.initialize()
        getLogger().debug('✅ Debug: SSE Server initialized successfully', {
          module: 'AgenticAISystem',
          operation: 'initialize'
        })
      } catch (error) {
        getLogger().warn('⚠️ Debug: SSE Server initialization failed, continuing without SSE support', {
          module: 'AgenticAISystem',
          operation: 'initialize',
          error: error instanceof Error ? error : new Error(String(error))
        })
      }

      getLogger().debug('🔧 Debug: Initializing MCP Bridge...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      try {
        await this.mcpBridge.initialize()
        getLogger().debug('✅ Debug: MCP Bridge initialized successfully', {
          module: 'AgenticAISystem',
          operation: 'initialize'
        })
      } catch (error) {
        getLogger().warn('⚠️ Debug: MCP Bridge initialization failed, continuing without bridge support', {
          module: 'AgenticAISystem',
          operation: 'initialize',
          error: error instanceof Error ? error : new Error(String(error))
        })
      }

      // Initialize MCP SSE Server
      getLogger().debug('🔧 Debug: Initializing MCP SSE Server...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      try {
        await this.mcpSSEServer.initialize()
        getLogger().debug('✅ Debug: MCP SSE Server initialized successfully', {
          module: 'AgenticAISystem',
          operation: 'initialize'
        })
      } catch (error) {
        getLogger().warn('⚠️ Debug: MCP SSE Server initialization failed, continuing without MCP SSE support', {
          module: 'AgenticAISystem',
          operation: 'initialize',
          error: error instanceof Error ? error : new Error(String(error))
        })
      }

      // Documentation system removed

      // Set up error handling for all components
      getLogger().debug('🔧 Debug: Setting up error handling...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      this.setupErrorHandling()
      getLogger().debug('✅ Debug: Error handling setup complete', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })

      // Register tools with MCP server
      getLogger().debug('🔧 Debug: Starting tool registration process...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      await this.registerTools()
      getLogger().debug('✅ Debug: Tool registration process complete', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })

      this.isInitialized = true
      getLogger().info('✅ Agentic AI System initialized successfully', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      
      // Removed documentation entries

    } catch (error) {
      console.error('❌ Failed to initialize Agentic AI System:', error)
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'AgenticAISystem',
          operation: 'initialize'
        },
        'critical'
      )
      throw error
    }
  }

  /**
   * Analyze a Nuxt.js project
   */
  // Removed analyzeProject per cleanup plan

  /**
   * Read file from filesystem
   */
  // Removed filesystem read/write/list methods

  /**
   * Write file to filesystem
   */

  /**
   * List directory contents
   */

  /**
   * Get system status
   */
  getSystemStatus(): {
    isInitialized: boolean
    mcpServer: any
    errorHandler: any
    browser: any
    taskExecution: any
    rocketship: any
    sse: any
    mcpBridge: any
    mcpSSE: any
  } {
    return {
      isInitialized: this.isInitialized,
      mcpServer: this.mcpServer.getStatus(),
      errorHandler: this.errorHandler.getErrorStats(),
      browser: this.browserManager.getBrowserStats(),
      taskExecution: this.taskExecutionManager.getStatus(),
      rocketship: {
        isInitialized: this.rocketshipAdapter['isInitialized'],
        activeExecutions: this.rocketshipAdapter.getActiveExecutions().length,
        testSuites: this.rocketshipAdapter.getAllTestSuites().length
      },
      sse: this.sseServer.getStatus(),
      mcpBridge: this.mcpBridge.getStatus(),
      mcpSSE: this.mcpSSEServer.getStatus()
    }
  }

  /**
   * Shutdown the system
   */
  async shutdown(): Promise<void> {
    try {
      getLogger().info('🔄 Shutting down Agentic AI System...', {
        module: 'AgenticAISystem',
        operation: 'shutdown'
      })

      // Removed documentation write on shutdown

      // Shutdown Phase 3 components
      await this.taskExecutionManager.shutdown()
      await this.rocketshipAdapter.shutdown()

      // Shutdown SSE components
      await this.mcpBridge.shutdown()
      await this.sseServer.shutdown()

      // Shutdown MCP SSE Server
      await this.mcpSSEServer.shutdown()

      // Shutdown browser manager
      await this.browserManager.shutdown()

      // Shutdown MCP server
      await this.mcpServer.shutdown()

      // Removed documentation status report

      this.isInitialized = false
      getLogger().info('✅ Agentic AI System shutdown complete', {
        module: 'AgenticAISystem',
        operation: 'shutdown'
      })
    } catch (error) {
      getLogger().error('❌ Error during shutdown', {
        module: 'AgenticAISystem',
        operation: 'shutdown',
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw error
    }
  }

  /**
   * Handle MCP request through the system
   */
  async handleMCPRequest(request: {
    id: string
    method: string
    params?: any
    timestamp?: number
    sessionId?: string
  }): Promise<any> {
    try {
      if (!this.isInitialized) {
        throw new Error('System not initialized')
      }

      console.log(`🔧 Handling MCP request: ${request.method}`)
      
      const result = await this.mcpServer.handleRequest({
        id: request.id,
        method: request.method,
        params: request.params,
        timestamp: request.timestamp || Date.now(),
        sessionId: request.sessionId || 'default'
      })

      // Documentation removed

      return result
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'AgenticAISystem',
          operation: 'handleMCPRequest',
          parameters: { method: request.method, params: request.params }
        }
      )
      throw error
    }
  }

  /**
   * Register tools with MCP server
   */
  private async registerTools(): Promise<void> {
    try {
      console.log('🔧 Debug: Starting tool registration with MCP server...')
      console.log('📊 Debug: MCP Server status before registration:', this._mcpServer.isReady() ? 'Initialized' : 'Not Initialized')

      // Register browser tools
      console.log('🔧 Debug: Registering browser tools...')
      await this._mcpServer.registerBrowserTools(this.browserManager)
      console.log('✅ Debug: Browser tools registered successfully')

      // Removed non-browser tools registration (project.analyze, filesystem.*, system.info, mcp.status)

      // Register browser session creation tool
      await registerBrowserTool(this._mcpServer, {
        name: 'browser.createSession',
        description: 'Create a new browser session',
        parameters: {
          sessionId: { type: 'string', required: true },
          url: { type: 'string', required: false }
        },
        handler: async (params: Record<string, any>) => {
          // Use the consistent convertHeadlessParameter function
          const headless = convertHeadlessParameter(params['headless'])
          
          console.log(`🔧 [Tool] browser.createSession called with:`, {
            sessionId: params['sessionId'],
            url: params['url'],
            rawHeadless: params['headless'],
            convertedHeadless: headless,
            type: typeof headless
          })
          
          return await this.browserManager.createSession(
            params['sessionId'] as string,
            params['url'] as string,
            { headless }
          )
        }
      })

      // Register browser navigation tool
      await registerBrowserTool(this._mcpServer, {
        name: 'browser.navigate',
        description: 'Navigate to a URL in a browser session',
        parameters: {
          sessionId: { type: 'string', required: true },
          url: { type: 'string', required: true }
        },
        handler: async (params: Record<string, any>) => {
          // Use the consistent convertHeadlessParameter function
          const headless = convertHeadlessParameter(params['headless'])
          
          console.log(`🔧 [Tool] browser.navigate called with:`, {
            sessionId: params['sessionId'],
            url: params['url'],
            rawHeadless: params['headless'],
            convertedHeadless: headless,
            type: typeof headless
          })
          
          await this.browserManager.navigateToUrl(
            params['sessionId'] as string,
            params['url'] as string,
            { headless }
          )
          return { success: true }
        }
      })

      // Register page inspection tool
      await registerBrowserTool(this._mcpServer, {
        name: 'browser.inspectPage',
        description: 'Inspect a page and map Vue components',
        parameters: {
          sessionId: { type: 'string', required: true },
          includeComputedStyles: { type: 'boolean', required: false },
          includeBoundingBox: { type: 'boolean', required: false },
          includeVisibility: { type: 'boolean', required: false },
          maxDepth: { type: 'number', required: false }
        },
        handler: async (params: Record<string, any>) => {
          return await this.browserManager.inspectPage(
            params['sessionId'] as string,
            {
              includeComputedStyles: params['includeComputedStyles'] as boolean,
              includeBoundingBox: params['includeBoundingBox'] as boolean,
              includeVisibility: params['includeVisibility'] as boolean,
              maxDepth: params['maxDepth'] as number
            }
          )
        }
      })

      // Register Vue component mapping tool
      await registerBrowserTool(this._mcpServer, {
        name: 'browser.mapVueComponents',
        description: 'Map Vue components in a browser session',
        parameters: {
          sessionId: { type: 'string', required: true },
          includeProps: { type: 'boolean', required: false },
          includeData: { type: 'boolean', required: false },
          includeComputed: { type: 'boolean', required: false },
          includeMethods: { type: 'boolean', required: false },
          includeEvents: { type: 'boolean', required: false },
          includeTemplate: { type: 'boolean', required: false },
          maxDepth: { type: 'number', required: false }
        },
        handler: async (params: Record<string, any>) => {
          return await this.browserManager.mapVueComponents(
            params['sessionId'] as string,
            {
              includeProps: params['includeProps'] as boolean,
              includeData: params['includeData'] as boolean,
              includeComputed: params['includeComputed'] as boolean,
              includeMethods: params['includeMethods'] as boolean,
              includeEvents: params['includeEvents'] as boolean,
              includeTemplate: params['includeTemplate'] as boolean,
              maxDepth: params['maxDepth'] as number
            }
          )
        }
      })

      // Register screenshot tool
      await registerBrowserTool(this._mcpServer, {
        name: 'browser.screenshot',
        description: 'Take a screenshot of the current page',
        parameters: {
          sessionId: { type: 'string', required: true },
          quality: { type: 'number', required: false },
          type: { type: 'string', required: false }
        },
        handler: async (params: Record<string, any>) => {
          const screenshot = await this.browserManager.takeScreenshot(
            params['sessionId'] as string,
            {
              quality: params['quality'] as number,
              type: params['type'] as 'png' | 'jpeg'
            }
          )
          return { screenshot: screenshot.toString('base64') }
        }
      })

      // Register JavaScript execution tool
      await registerBrowserTool(this._mcpServer, {
        name: 'browser.executeScript',
        description: 'Execute JavaScript in the browser',
        parameters: {
          sessionId: { type: 'string', required: true },
          script: { type: 'string', required: true }
        },
        handler: async (params: Record<string, any>) => {
          return await this.browserManager.executeJavaScript(
            params['sessionId'] as string,
            params['script'] as string
          )
        }
      })

      // Register element inspection tool
      await this._mcpServer.registerTool({
        name: 'browser.getElementInfo',
        description: 'Get detailed information about a DOM element',
        parameters: {
          sessionId: { type: 'string', required: true },
          selector: { type: 'string', required: true }
        },
        handler: async (params: Record<string, any>) => {
          return await this.browserManager.getElementInfo(
            params['sessionId'] as string,
            params['selector'] as string
          )
        }
      })

      // Register session management tools
      await registerBrowserTool(this._mcpServer, {
        name: 'browser.closeSession',
        description: 'Close a browser session',
        parameters: {
          sessionId: { type: 'string', required: true }
        },
        handler: async (params: Record<string, any>) => {
          await this.browserManager.closeSession(params['sessionId'] as string)
          return { success: true }
        }
      })

      await this._mcpServer.registerTool({
        name: 'browser.getSessions',
        description: 'Get all browser sessions',
        parameters: {},
        handler: async () => {
          return this.browserManager.getAllSessions()
        }
      })

      // Register Phase 3 task execution tools
      await this._mcpServer.registerTool({
        name: 'task.create',
        description: 'Create a new development task',
        parameters: {
          title: { type: 'string', required: true },
          description: { type: 'string', required: true },
          type: { type: 'string', required: true },
          priority: { type: 'string', required: true },
          estimatedDuration: { type: 'number', required: true },
          projectPath: { type: 'string', required: true },
          environment: { type: 'string', required: true }
        },
        handler: async (params: Record<string, any>) => {
          const requirement = {
            id: `req_${Date.now()}`,
            title: params['title'],
            description: params['description'],
            type: params['type'],
            priority: params['priority'],
            estimatedDuration: params['estimatedDuration'],
            dependencies: [],
            resources: [],
            constraints: {}
          }
          
          const context = {
            projectPath: params['projectPath'],
            currentBranch: 'main',
            availableResources: [],
            constraints: {},
            environment: params['environment']
          }
          
          return await this.taskExecutionManager.getTaskScheduler().submitTask(requirement, context)
        }
      })
      // Register testing tools
      await this._mcpServer.registerTool({
        name: 'testing.create_test_case',
        description: 'Create a new test case with specified parameters',
        parameters: {
          name: { type: 'string', required: true, description: 'Test case name' },
          description: { type: 'string', required: true, description: 'Test case description' },
          type: { type: 'string', enum: ['unit', 'integration', 'e2e', 'visual', 'performance'], required: true },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], required: true },
          steps: { type: 'array', required: true, description: 'Test steps' },
          timeout: { type: 'number', required: false },
          retries: { type: 'number', required: false },
          tags: { type: 'array', required: false }
        },
        handler: async (params: Record<string, any>) => {
          const input = {
            name: params['name'] as string,
            description: params['description'] as string,
            type: params['type'] as any,
            priority: params['priority'] as any,
            browserRequirements: [],
            testSteps: params['steps'] as any[],
            expectedResults: [],
            timeout: (params['timeout'] as number) ?? 30000,
            retries: (params['retries'] as number) ?? 0,
            tags: (params['tags'] as string[]) ?? []
          }
          return await this.testingManager.createTestCase(input)
        }
      })

      await this._mcpServer.registerTool({
        name: 'testing.execute_test_suite',
        description: 'Execute a complete test suite',
        parameters: {
          suiteId: { type: 'string', required: true, description: 'Test suite ID' },
          environment: { type: 'string', required: true, description: 'Test environment' },
          parallel: { type: 'boolean', default: false, description: 'Run tests in parallel' }
        },
        handler: async (params: Record<string, any>) => {
          return await this.testingManager.executeTestSuite(
            params['suiteId'] as string,
            params['environment'] as string,
            (params['parallel'] as boolean) ?? false
          )
        }
      })

      await this._mcpServer.registerTool({
        name: 'testing.generate_test_report',
        description: 'Generate comprehensive test report',
        parameters: {
          testRunId: { type: 'string', required: true, description: 'Test run ID' },
          format: { type: 'string', enum: ['html', 'json', 'junit'], default: 'html' },
          includeArtifacts: { type: 'boolean', default: true, description: 'Include test artifacts' }
        },
        handler: async (params: Record<string, any>) => {
          return await this.testingManager.generateTestReport(
            params['testRunId'] as string,
            (params['format'] as 'html' | 'json' | 'junit') ?? 'html',
            (params['includeArtifacts'] as boolean) ?? true
          )
        }
      })

      await this._mcpServer.registerTool({
        name: 'task.execute',
        description: 'Execute a specific task',
        parameters: {
          taskId: { type: 'string', required: true }
        },
        handler: async (params: Record<string, any>) => {
          const taskId = params['taskId'] as string
          const scheduler = this.taskExecutionManager.getTaskScheduler()
          const queues = scheduler.getAllQueues()
          
          for (const queue of queues) {
            const task = queue.queuedTasks.find(t => t.id === taskId)
            if (task) {
              return await scheduler.processQueue(queue.id)
            }
          }
          
          throw new Error(`Task not found: ${taskId}`)
        }
      })

      await this._mcpServer.registerTool({
        name: 'task.list',
        description: 'List all tasks',
        parameters: {
          status: { type: 'string', required: false },
          type: { type: 'string', required: false }
        },
        handler: async (params: Record<string, any>) => {
          const scheduler = this.taskExecutionManager.getTaskScheduler()
          const executor = this.taskExecutionManager.getTaskExecutor()
          
          const allTasks: any[] = []
          
          // Get tasks from queues
          const queues = scheduler.getAllQueues()
          for (const queue of queues) {
            for (const task of queue.queuedTasks) {
              allTasks.push({
                ...task,
                queueId: queue.id,
                status: 'queued'
              })
            }
          }
          
          // Get active executions
          const activeExecutions = executor.getActiveExecutions()
          for (const execution of activeExecutions) {
            allTasks.push({
              id: execution.id,
              status: execution.status,
              progress: execution.progress,
              startTime: execution.startTime
            })
          }
          
          return allTasks
        }
      })

      await this._mcpServer.registerTool({
        name: 'task.status',
        description: 'Get task status',
        parameters: {
          taskId: { type: 'string', required: true }
        },
        handler: async (params: Record<string, any>) => {
          const taskId = params['taskId'] as string
          const scheduler = this.taskExecutionManager.getTaskScheduler()
          const executor = this.taskExecutionManager.getTaskExecutor()
          
          // Check in queues
          const queues = scheduler.getAllQueues()
          for (const queue of queues) {
            const task = queue.queuedTasks.find(t => t.id === taskId)
            if (task) {
              return {
                taskId,
                status: 'queued',
                queueId: queue.id,
                priority: task.priority,
                createdAt: task.createdAt
              }
            }
          }
          
          // Check in active executions
          const execution = executor.getExecutionStatus(taskId)
          if (execution) {
            return {
              taskId,
              status: execution.status,
              progress: execution.progress,
              currentStep: execution.currentStep,
              totalSteps: execution.totalSteps,
              startTime: execution.startTime
            }
          }
          
          throw new Error(`Task not found: ${taskId}`)
        }
      })

      await this._mcpServer.registerTool({
        name: 'task.cancel',
        description: 'Cancel a running task',
        parameters: {
          taskId: { type: 'string', required: true }
        },
        handler: async (params: Record<string, any>) => {
          const taskId = params['taskId'] as string
          await this.taskExecutionManager.getTaskScheduler().cancelTask(taskId)
          return { success: true, message: 'Task cancelled successfully' }
        }
      })

      // Register Rocketship testing tools
      await this._mcpServer.registerTool({
        name: 'rocketship.run',
        description: 'Run Rocketship tests',
        parameters: {
          suiteId: { type: 'string', required: true }
        },
        handler: async (params: Record<string, any>) => {
          const suiteId = params['suiteId'] as string
          return await this.rocketshipAdapter.executeTestSuite(suiteId)
        }
      })

      await this._mcpServer.registerTool({
        name: 'rocketship.createSuite',
        description: 'Create a new test suite',
        parameters: {
          name: { type: 'string', required: true },
          description: { type: 'string', required: true }
        },
        handler: async (params: Record<string, any>) => {
          const name = params['name'] as string
          const description = params['description'] as string
          return await this.rocketshipAdapter.createTestSuite(name, description, [])
        }
      })

      await this._mcpServer.registerTool({
        name: 'rocketship.getReport',
        description: 'Generate test report',
        parameters: {
          executionId: { type: 'string', required: true },
          format: { type: 'string', required: false }
        },
        handler: async (params: Record<string, any>) => {
          const executionId = params['executionId'] as string
          const format = (params['format'] as string) || 'json'
          return await this.rocketshipAdapter.generateReport(executionId, format as any)
        }
      })

      // Register system information tools
      

      console.log('🔧 Tools registered with MCP server')
      console.log('📊 Debug: Tool registration summary:')
      getLogger().debug(`   - Total tools registered: ${this._mcpServer.getAllTools().length}`, {
        module: 'AgenticAISystem',
        operation: 'registerTools'
      })
      getLogger().debug(`   - Available tools: ${this._mcpServer.getAllTools().map(tool => tool.name).join(', ')}`, {
        module: 'AgenticAISystem',
        operation: 'registerTools'
      })
      getLogger().debug('✅ Debug: Tool registration process completed successfully', {
        module: 'AgenticAISystem',
        operation: 'registerTools'
      })
    } catch (error) {
      getLogger().error('❌ Failed to register tools', {
        module: 'AgenticAISystem',
        operation: 'registerTools',
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw error
    }
  }

  /**
   * Set up error handling for all components
   */
  private setupErrorHandling(): void {
    // Handle MCP server errors
    this.mcpServer.on('error', async (error) => {
      await this.errorHandler.handleError(
        error,
        {
          module: 'MCPServer',
          operation: 'handleRequest'
        }
      )
    })

    // Filesystem error hook removed
  }
}

// Main execution
async function main() {
  const system = new AgenticAISystem()
  
  try {
    await system.initialize()
    
    // Keep the system running
    process.on('SIGINT', async () => {
      getLogger().info('\n🛑 Received SIGINT, shutting down...', {
        module: 'Main',
        operation: 'signalHandler'
      })
      await system.shutdown()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      getLogger().info('\n🛑 Received SIGTERM, shutting down...', {
        module: 'Main',
        operation: 'signalHandler'
      })
      await system.shutdown()
      process.exit(0)
    })

    getLogger().info('🎯 Agentic AI System is ready for operation', {
      module: 'Main',
      operation: 'main'
    })
    getLogger().debug('📊 System Status', {
      module: 'Main',
      operation: 'main',
      data: system.getSystemStatus()
    })
    
    // Additional debug information
    getLogger().debug('🔍 Debug: Final system check', {
      module: 'Main',
      operation: 'main',
      data: {
        mcpServerInitialized: system.getSystemStatus().mcpServer.isInitialized,
        totalRegisteredTools: system.getSystemStatus().mcpServer.registeredTools,
        errorHandlerReady: system.getSystemStatus().errorHandler.total === 0 ? 'Yes' : 'No',
        browserManagerReady: system.getSystemStatus().browser.totalSessions >= 0 ? 'Yes' : 'No',
        taskExecutionReady: system.getSystemStatus().taskExecution.isInitialized ? 'Yes' : 'No'
      }
    })
    
    getLogger().info('🚀 Debug: System is ready to receive MCP requests from Cursor', {
      module: 'Main',
      operation: 'main'
    })
    getLogger().debug('📝 Debug: To connect from Cursor, ensure the MCP server is properly configured', {
      module: 'Main',
      operation: 'main'
    })
    
    // Display MCP server information for Cursor integration
    const mcpInfo = system.mcpServer.getMCPInfo()
    getLogger().debug('🔗 Debug: MCP Server Information for Cursor', {
      module: 'Main',
      operation: 'main',
      data: {
        serverName: mcpInfo.serverName,
        version: mcpInfo.version,
        capabilities: mcpInfo.capabilities,
        connectionType: mcpInfo.connectionInfo.type,
        port: mcpInfo.connectionInfo.port,
        endpoint: mcpInfo.connectionInfo.endpoint,
        availableTools: mcpInfo.tools.length
      }
    })
    
    getLogger().debug('📋 Debug: Cursor Integration Instructions', {
      module: 'Main',
      operation: 'main',
      data: {
        instructions: [
          'Ensure Cursor is configured to use this MCP server',
          'Connection should be via SSE on port 3003',
          'Endpoint: http://localhost:3003/events',
          `Total tools available: ${mcpInfo.tools.length}`
        ]
      }
    })
    
  } catch (error) {
    getLogger().critical('❌ Failed to start Agentic AI System', {
      module: 'Main',
      operation: 'main',
      error: error instanceof Error ? error : new Error(String(error))
    })
    process.exit(1)
  }
}

// Run main if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
} 