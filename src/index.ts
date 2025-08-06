#!/usr/bin/env node

/**
 * Agentic AI System - Main Entry Point
 * Coordinates all modules and provides the main interface for the system
 */

import { MCPServer } from './core/mcp-server.js'
import { ProjectAnalyzer } from './modules/project-analyzer.js'
import { FileSystemManager } from './modules/filesystem-manager.js'
import { ErrorHandler } from './core/error-handler.js'
import { DocumentationGenerator } from './modules/documentation-generator.js'
import { BrowserManager } from './modules/browser/browser-manager.js'
import { TaskExecutionManager } from './modules/task-execution/index.js'
import { TaskAPI } from './modules/api/task-api.js'
import { RocketshipAdapter } from './modules/rocketship/rocketship-adapter.js'
import { SSEServer, MCPBridge, MCPSSEServer, MCPSSEClient } from './modules/sse/index.js'
import { getLogger } from './core/logger.js'

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
  private projectAnalyzer: ProjectAnalyzer | null = null
  private fileSystemManager: FileSystemManager
  private errorHandler: ErrorHandler
  private documentationGenerator: DocumentationGenerator
  private browserManager: BrowserManager
  private taskExecutionManager: TaskExecutionManager
  private taskAPI: TaskAPI
  private rocketshipAdapter: RocketshipAdapter
  private sseServer: SSEServer
  private mcpBridge: MCPBridge
  private mcpSSEServer: MCPSSEServer
  private isInitialized = false

  constructor() {
    // Initialize core components
    this._mcpServer = new MCPServer()
    this.fileSystemManager = new FileSystemManager()
    this.errorHandler = new ErrorHandler()
    this.documentationGenerator = new DocumentationGenerator()
    this.browserManager = new BrowserManager()
    
    // Initialize Phase 3 components
    this.taskExecutionManager = new TaskExecutionManager()
    this.taskAPI = new TaskAPI()
    this.rocketshipAdapter = new RocketshipAdapter()
    
    // Initialize SSE components
    this.sseServer = new SSEServer({
      port: 3003,
      corsOrigin: '*',
      maxClients: 100,
      heartbeatInterval: 30000
    })
    this.mcpBridge = new MCPBridge(this.sseServer, this.mcpServer)
    
    // Initialize MCP SSE Server
    this.mcpSSEServer = new MCPSSEServer({
      port: 3000,
      corsOrigin: '*',
      serverName: 'agentic-ai-mcp-server',
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
      await this.browserManager.initialize()
      getLogger().debug('✅ Debug: Browser Manager initialized successfully', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })

      // Initialize Phase 3 components
      getLogger().debug('🔧 Debug: Initializing Task Execution Manager...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      await this.taskExecutionManager.initialize()
      getLogger().debug('✅ Debug: Task Execution Manager initialized successfully', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })

      getLogger().debug('🔧 Debug: Initializing Task API...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      await this.taskAPI.initialize()
      getLogger().debug('✅ Debug: Task API initialized successfully', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })

      getLogger().debug('🔧 Debug: Initializing Rocketship Adapter...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      await this.rocketshipAdapter.initialize()
      getLogger().debug('✅ Debug: Rocketship Adapter initialized successfully', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })

      // Initialize SSE components
      getLogger().debug('🔧 Debug: Initializing SSE Server...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      await this.sseServer.initialize()
      getLogger().debug('✅ Debug: SSE Server initialized successfully', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })

      getLogger().debug('🔧 Debug: Initializing MCP Bridge...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      await this.mcpBridge.initialize()
      getLogger().debug('✅ Debug: MCP Bridge initialized successfully', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })

      // Initialize MCP SSE Server
      getLogger().debug('🔧 Debug: Initializing MCP SSE Server...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      await this.mcpSSEServer.initialize()
      getLogger().debug('✅ Debug: MCP SSE Server initialized successfully', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })

      // Initialize documentation system
      getLogger().debug('🔧 Debug: Initializing Documentation System...', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })
      await this.documentationGenerator.generateSystemStatusReport()
      getLogger().debug('✅ Debug: Documentation System initialized successfully', {
        module: 'AgenticAISystem',
        operation: 'initialize'
      })

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
      
      // Generate initial documentation
      await this.documentationGenerator.addEntry({
        id: 'init',
        timestamp: new Date(),
        type: 'info',
        title: 'System Initialization',
        description: 'Agentic AI System initialized successfully',
        tags: ['initialization', 'system'],
        priority: 'high'
      })

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
  async analyzeProject(projectPath: string): Promise<any> {
    try {
      if (!this.isInitialized) {
        throw new Error('System not initialized')
      }

      console.log(`📁 Analyzing project: ${projectPath}`)

      // Create project analyzer
      this.projectAnalyzer = new ProjectAnalyzer(projectPath)

      // Analyze project structure
      const structure = await this.projectAnalyzer.analyzeStructure()

      // Document the analysis
      await this.documentationGenerator.addEntry({
        id: `analysis_${Date.now()}`,
        timestamp: new Date(),
        type: 'task',
        title: 'Project Analysis',
        description: `Analyzed Nuxt.js project at ${projectPath}`,
        details: {
          projectPath,
          structure: {
            type: structure.type,
            version: structure.version,
            components: structure.components.length,
            pages: structure.pages.length,
            layouts: structure.layouts.length
          }
        },
        tags: ['analysis', 'nuxt', 'project'],
        priority: 'high'
      })

      return structure
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'AgenticAISystem',
          operation: 'analyzeProject',
          parameters: { projectPath }
        }
      )
      throw error
    }
  }

  /**
   * Read file from filesystem
   */
  async readFile(path: string): Promise<string> {
    try {
      if (!this.isInitialized) {
        throw new Error('System not initialized')
      }

      console.log(`📖 Reading file: ${path}`)
      const content = await this.fileSystemManager.readFile(path)

      // Document the file read operation
      await this.documentationGenerator.addEntry({
        id: `read_${Date.now()}`,
        timestamp: new Date(),
        type: 'task',
        title: 'File Read',
        description: `Read file: ${path}`,
        details: {
          path,
          contentLength: content.length
        },
        tags: ['filesystem', 'read'],
        priority: 'medium'
      })

      return content
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'AgenticAISystem',
          operation: 'readFile',
          parameters: { path }
        }
      )
      throw error
    }
  }

  /**
   * Write file to filesystem
   */
  async writeFile(path: string, content: string): Promise<void> {
    try {
      if (!this.isInitialized) {
        throw new Error('System not initialized')
      }

      console.log(`📝 Writing file: ${path}`)
      await this.fileSystemManager.writeFile(path, content)

      // Document the file write operation
      await this.documentationGenerator.addEntry({
        id: `write_${Date.now()}`,
        timestamp: new Date(),
        type: 'task',
        title: 'File Write',
        description: `Wrote file: ${path}`,
        details: {
          path,
          contentLength: content.length
        },
        tags: ['filesystem', 'write'],
        priority: 'medium'
      })
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'AgenticAISystem',
          operation: 'writeFile',
          parameters: { path, contentLength: content.length }
        }
      )
      throw error
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(path: string): Promise<any> {
    try {
      if (!this.isInitialized) {
        throw new Error('System not initialized')
      }

      console.log(`📂 Listing directory: ${path}`)
      const directoryInfo = await this.fileSystemManager.listDirectory(path)

      // Document the directory listing operation
      await this.documentationGenerator.addEntry({
        id: `list_${Date.now()}`,
        timestamp: new Date(),
        type: 'task',
        title: 'Directory Listing',
        description: `Listed directory: ${path}`,
        details: {
          path,
          fileCount: directoryInfo.fileCount,
          totalSize: directoryInfo.totalSize
        },
        tags: ['filesystem', 'list'],
        priority: 'low'
      })

      return directoryInfo
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'AgenticAISystem',
          operation: 'listDirectory',
          parameters: { path }
        }
      )
      throw error
    }
  }

  /**
   * Get system status
   */
  getSystemStatus(): {
    isInitialized: boolean
    mcpServer: any
    errorHandler: any
    documentation: any
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
      documentation: {
        entries: this.documentationGenerator.getEntries().length,
        tasks: this.documentationGenerator.getTasks().length,
        decisions: this.documentationGenerator.getDecisions().length
      },
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

      // Document the shutdown
      await this.documentationGenerator.addEntry({
        id: `shutdown_${Date.now()}`,
        timestamp: new Date(),
        type: 'info',
        title: 'System Shutdown',
        description: 'Agentic AI System shutting down',
        tags: ['shutdown', 'system'],
        priority: 'high'
      })

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

      // Generate final status report
      await this.documentationGenerator.generateSystemStatusReport()

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

      // Document the MCP request
      await this.documentationGenerator.addEntry({
        id: `mcp_${Date.now()}`,
        timestamp: new Date(),
        type: 'task',
        title: 'MCP Request',
        description: `Handled MCP request: ${request.method}`,
        details: {
          method: request.method,
          params: request.params,
          sessionId: request.sessionId
        },
        tags: ['mcp', 'request'],
        priority: 'medium'
      })

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

      // Register project analysis tool
      console.log('🔧 Debug: Registering project.analyze tool...')
      await this._mcpServer.registerTool({
        name: 'project.analyze',
        description: 'Analyze Nuxt.js project structure',
        parameters: {
          projectPath: { type: 'string', required: true }
        },
        handler: async (params: Record<string, any>) => {
          console.log('🔧 Debug: project.analyze tool called with params:', params)
          return await this.analyzeProject(params['projectPath'] as string)
        }
      })
      console.log('✅ Debug: project.analyze tool registered successfully')

      // Register file read tool
      console.log('🔧 Debug: Registering filesystem.read tool...')
      await this._mcpServer.registerTool({
        name: 'filesystem.read',
        description: 'Read file from filesystem',
        parameters: {
          path: { type: 'string', required: true }
        },
        handler: async (params: Record<string, any>) => {
          console.log('🔧 Debug: filesystem.read tool called with params:', params)
          return await this.readFile(params['path'] as string)
        }
      })
      console.log('✅ Debug: filesystem.read tool registered successfully')

      // Register file write tool
      await this._mcpServer.registerTool({
        name: 'filesystem.write',
        description: 'Write file to filesystem',
        parameters: {
          path: { type: 'string', required: true },
          content: { type: 'string', required: true }
        },
        handler: async (params: Record<string, any>) => {
          await this.writeFile(params['path'] as string, params['content'] as string)
          return { success: true }
        }
      })

      // Register directory listing tool
      await this._mcpServer.registerTool({
        name: 'filesystem.list',
        description: 'List directory contents',
        parameters: {
          path: { type: 'string', required: true }
        },
        handler: async (params: Record<string, any>) => {
          return await this.listDirectory(params['path'] as string)
        }
      })

      // Register browser session creation tool
      await this._mcpServer.registerTool({
        name: 'browser.createSession',
        description: 'Create a new browser session',
        parameters: {
          sessionId: { type: 'string', required: true },
          url: { type: 'string', required: false }
        },
        handler: async (params: Record<string, any>) => {
          return await this.browserManager.createSession(
            params['sessionId'] as string,
            params['url'] as string
          )
        }
      })

      // Register browser navigation tool
      await this._mcpServer.registerTool({
        name: 'browser.navigate',
        description: 'Navigate to a URL in a browser session',
        parameters: {
          sessionId: { type: 'string', required: true },
          url: { type: 'string', required: true }
        },
        handler: async (params: Record<string, any>) => {
          await this.browserManager.navigateToUrl(
            params['sessionId'] as string,
            params['url'] as string
          )
          return { success: true }
        }
      })

      // Register page inspection tool
      await this._mcpServer.registerTool({
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
      await this._mcpServer.registerTool({
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
      await this._mcpServer.registerTool({
        name: 'browser.screenshot',
        description: 'Take a screenshot of the current page',
        parameters: {
          sessionId: { type: 'string', required: true },
          fullPage: { type: 'boolean', required: false },
          quality: { type: 'number', required: false },
          type: { type: 'string', required: false }
        },
        handler: async (params: Record<string, any>) => {
          const screenshot = await this.browserManager.takeScreenshot(
            params['sessionId'] as string,
            {
              fullPage: params['fullPage'] as boolean,
              quality: params['quality'] as number,
              type: params['type'] as 'png' | 'jpeg'
            }
          )
          return { screenshot: screenshot.toString('base64') }
        }
      })

      // Register JavaScript execution tool
      await this._mcpServer.registerTool({
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
      await this._mcpServer.registerTool({
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

    // Handle filesystem errors
    this.fileSystemManager.getOperationLog().forEach(operation => {
      if (!operation.success) {
        this.errorHandler.handleError(
          new Error(operation.error || 'Unknown filesystem error'),
          {
            module: 'FileSystemManager',
            operation: operation.type
          }
        )
      }
    })
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
if (require.main === module) {
  main()
} 