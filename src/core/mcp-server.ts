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
 * Utility function to create a browser tool with automatic headless parameter injection
 */
function createBrowserTool(tool: Omit<MCPTool, 'parameters'> & { parameters: Record<string, any> }): MCPTool {
  return {
    ...tool,
    parameters: injectHeadlessParameter(tool.parameters)
  }
}

export class MCPServer extends EventEmitter {
  private tools: Map<string, MCPTool> = new Map()
  private sessions: Map<string, MCPSession> = new Map()
  private isInitialized: boolean = false
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
      
      // Handle MCP protocol specific methods
      if (request.method === 'tools/list') {
        return this.handleToolDiscovery(request)
      }
      
      if (request.method === 'tools/call') {
        return this.handleToolCall(request)
      }
      
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
   * Handle tool discovery request (MCP protocol)
   */
  private handleToolDiscovery(request: MCPRequest): MCPResponse {
    console.log('🔍 Debug: Handling tool discovery request')
    
    const toolList = Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object',
        properties: this.convertParametersToSchema(tool.parameters),
        required: this.getRequiredParameters(tool.parameters)
      }
    }))
    
    console.log(`✅ Debug: Tool discovery completed: ${toolList.length} tools found`)
    
    return {
      id: request.id,
      result: {
        tools: toolList
      },
      timestamp: Date.now()
    }
  }

  /**
   * Handle tool call request (MCP protocol)
   */
  private async handleToolCall(request: MCPRequest): Promise<MCPResponse> {
    const toolName = request.params?.name
    const toolParams = request.params?.arguments || {}
    
    if (!toolName) {
      return this.createErrorResponse(request.id, 400, 'Missing tool name')
    }
    
    const tool = this.tools.get(toolName)
    if (!tool) {
      return this.createErrorResponse(request.id, 404, `Tool '${toolName}' not found`)
    }
    
    try {
      const result = await tool.handler(toolParams)
      return {
        id: request.id,
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        },
        timestamp: Date.now()
      }
    } catch (error) {
      return this.createErrorResponse(request.id, 500, `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
   * Register browser tools with the MCP server
   */
  async registerBrowserTools(browserManager: any): Promise<void> {
    console.log('🔧 Debug: Registering browser tools...')
    
    // Register browser session management tools
    await this.registerTool(createBrowserTool({
      name: 'browser.createSession',
      description: 'Create a new browser session',
      parameters: {
        sessionId: { type: 'string', required: true },
        url: { type: 'string', required: false },
        headless: { type: 'boolean', required: false }
      },
      handler: async (params: Record<string, any>) => {
        // Convert headless parameter properly from string to boolean
        const headless = params['headless'] === 'false' ? false : 
                        params['headless'] === 'true' ? true : 
                        params['headless'] !== undefined ? Boolean(params['headless']) : true
        
        return await browserManager.createSession(
          params['sessionId'] as string,
          params['url'] as string,
          { headless }
        )
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.navigate',
      description: 'Navigate to URL in browser session',
      parameters: {
        sessionId: { type: 'string', required: true },
        url: { type: 'string', required: true },
        timeout: { type: 'number', required: false },
        waitUntil: { type: 'string', required: false },
        headless: { type: 'boolean', required: false }
      },
      handler: async (params: Record<string, any>) => {
        // Convert headless parameter properly from string to boolean
        const headless = params['headless'] === 'false' ? false : 
                        params['headless'] === 'true' ? true : 
                        params['headless'] !== undefined ? Boolean(params['headless']) : true
        
        await browserManager.navigateToUrl(
          params['sessionId'] as string,
          params['url'] as string,
          { headless }
        )
        return { success: true }
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.click',
      description: 'Click element by selector',
      parameters: {
        sessionId: { type: 'string', required: true },
        selector: { type: 'string', required: true },
        timeout: { type: 'number', required: false }
      },
      handler: async (params: Record<string, any>) => {
        await browserManager.clickElement(
          params['sessionId'] as string,
          params['selector'] as string,
          params
        )
        return { success: true }
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.fill',
      description: 'Fill form element with value',
      parameters: {
        sessionId: { type: 'string', required: true },
        selector: { type: 'string', required: true },
        value: { type: 'string', required: true },
        timeout: { type: 'number', required: false }
      },
      handler: async (params: Record<string, any>) => {
        await browserManager.fillElement(
          params['sessionId'] as string,
          params['selector'] as string,
          params['value'] as string,
          params
        )
        return { success: true }
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.select',
      description: 'Select option from dropdown',
      parameters: {
        sessionId: { type: 'string', required: true },
        selector: { type: 'string', required: true },
        value: { type: 'string', required: true }
      },
      handler: async (params: Record<string, any>) => {
        await browserManager.selectOption(
          params['sessionId'] as string,
          params['selector'] as string,
          params['value'] as string,
          params
        )
        return { success: true }
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.wait',
      description: 'Wait for element or condition',
      parameters: {
        sessionId: { type: 'string', required: true },
        selector: { type: 'string', required: true },
        timeout: { type: 'number', required: false },
        condition: { type: 'string', required: false }
      },
      handler: async (params: Record<string, any>) => {
        const element = await browserManager.waitForElement(
          params['sessionId'] as string,
          params['selector'] as string,
          params
        )
        return { element }
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.screenshot',
      description: 'Capture page or element screenshot',
      parameters: {
        sessionId: { type: 'string', required: true },

        quality: { type: 'number', required: false },
        type: { type: 'string', required: false },
        path: { type: 'string', required: false }
      },
      handler: async (params: Record<string, any>) => {
        const result = await browserManager.takeScreenshot(
          params['sessionId'] as string,
          params
        )
        return result
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.extract',
      description: 'Extract content from specific elements',
      parameters: {
        sessionId: { type: 'string', required: true },
        selector: { type: 'string', required: true },
        attribute: { type: 'string', required: false }
      },
      handler: async (params: Record<string, any>) => {
        const element = await browserManager.getElementInfo(
          params['sessionId'] as string,
          params['selector'] as string
        )
        return { element }
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.execute',
      description: 'Execute JavaScript code',
      parameters: {
        sessionId: { type: 'string', required: true },
        script: { type: 'string', required: true },
        args: { type: 'array', required: false }
      },
      handler: async (params: Record<string, any>) => {
        const result = await browserManager.executeJavaScript(
          params['sessionId'] as string,
          params['script'] as string,
          params
        )
        return { result }
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.back',
      description: 'Navigate back in history',
      parameters: {
        sessionId: { type: 'string', required: true }
      },
      handler: async (params: Record<string, any>) => {
        await browserManager.goBack(params['sessionId'] as string)
        return { success: true }
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.forward',
      description: 'Navigate forward in history',
      parameters: {
        sessionId: { type: 'string', required: true }
      },
      handler: async (params: Record<string, any>) => {
        await browserManager.goForward(params['sessionId'] as string)
        return { success: true }
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.refresh',
      description: 'Refresh current page',
      parameters: {
        sessionId: { type: 'string', required: true },
        timeout: { type: 'number', required: false }
      },
      handler: async (params: Record<string, any>) => {
        await browserManager.refresh(params['sessionId'] as string)
        return { success: true }
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.html',
      description: 'Get page HTML content',
      parameters: {
        sessionId: { type: 'string', required: true }
      },
      handler: async (params: Record<string, any>) => {
        const html = await browserManager.executeJavaScript(
          params['sessionId'] as string,
          'document.documentElement.outerHTML'
        )
        return { html }
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.text',
      description: 'Extract text content from page',
      parameters: {
        sessionId: { type: 'string', required: true },
        selector: { type: 'string', required: false }
      },
      handler: async (params: Record<string, any>) => {
        const script = params['selector'] 
          ? `document.querySelector('${params['selector']}')?.textContent || ''`
          : 'document.body.textContent || ""'
        
        const text = await browserManager.executeJavaScript(
          params['sessionId'] as string,
          script
        )
        return { text, selector: params['selector'] }
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.scroll',
      description: 'Scroll page or specific elements',
      parameters: {
        sessionId: { type: 'string', required: true },
        selector: { type: 'string', required: false },
        x: { type: 'number', required: false },
        y: { type: 'number', required: false }
      },
      handler: async (params: Record<string, any>) => {
        if (params['selector']) {
          const script = `
            const element = document.querySelector('${params['selector']}');
            if (element) {
              element.scrollIntoView({ behavior: 'smooth' });
              return { scrolled: true, selector: '${params['selector']}' };
            }
            return { scrolled: false, error: 'Element not found' };
          `
          const result = await browserManager.executeJavaScript(
            params['sessionId'] as string,
            script
          )
          return { selector: params['selector'], result }
        } else {
          const scrollX = params['x'] || 0
          const scrollY = params['y'] || 0
          const script = `window.scrollTo(${scrollX}, ${scrollY}); return { x: ${scrollX}, y: ${scrollY} };`
          const result = await browserManager.executeJavaScript(
            params['sessionId'] as string,
            script
          )
          return { x: scrollX, y: scrollY, result }
        }
      }
    }))

    // Unified interact tool that consolidates fill, select, click, and scroll
    await this.registerTool(createBrowserTool({
      name: 'interact',
      description: 'Unified tool for browser interactions: fill, select, click, and scroll',
      parameters: {
        sessionId: { type: 'string', required: true },
        action: { type: 'string', required: true, enum: ['fill', 'select', 'click', 'scroll'] },
        selector: { type: 'string', required: false },
        value: { type: 'string', required: false },
        x: { type: 'number', required: false },
        y: { type: 'number', required: false },
        timeout: { type: 'number', required: false }
      },
      handler: async (params: Record<string, any>) => {
        const sessionId = params['sessionId'] as string
        const action = params['action'] as string
        const selector = params['selector'] as string
        const value = params['value'] as string
        const x = params['x'] as number
        const y = params['y'] as number
        const timeout = params['timeout'] as number

        switch (action) {
          case 'fill':
            if (!selector || !value) {
              throw new Error('Fill action requires both selector and value parameters')
            }
            await browserManager.fillElement(sessionId, selector, value, { timeout })
            return { success: true, action: 'fill', selector, value }

          case 'select':
            if (!selector || !value) {
              throw new Error('Select action requires both selector and value parameters')
            }
            await browserManager.selectOption(sessionId, selector, value, { timeout })
            return { success: true, action: 'select', selector, value }

          case 'click':
            if (!selector) {
              throw new Error('Click action requires selector parameter')
            }
            await browserManager.clickElement(sessionId, selector, { timeout })
            return { success: true, action: 'click', selector }

          case 'scroll':
            if (selector) {
              const script = `
                const element = document.querySelector('${selector}');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth' });
                  return { scrolled: true, selector: '${selector}' };
                }
                return { scrolled: false, error: 'Element not found' };
              `
              const result = await browserManager.executeJavaScript(sessionId, script)
              return { success: true, action: 'scroll', selector, result }
            } else {
              const scrollX = x || 0
              const scrollY = y || 0
              const script = `window.scrollTo(${scrollX}, ${scrollY}); return { x: ${scrollX}, y: ${scrollY} };`
              const result = await browserManager.executeJavaScript(sessionId, script)
              return { success: true, action: 'scroll', x: scrollX, y: scrollY, result }
            }

          default:
            throw new Error(`Unknown action: ${action}. Supported actions: fill, select, click, scroll`)
        }
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.network',
      description: 'Monitor network requests and responses',
      parameters: {
        sessionId: { type: 'string', required: true },
        action: { type: 'string', required: true }
      },
      handler: async (params: Record<string, any>) => {
        const action = params['action'] as string
        let result: any
        
        switch (action) {
          case 'start':
          case 'get':
            result = await browserManager.getNetworkMetrics(params['sessionId'] as string)
            break
          case 'stop':
            result = { message: 'Network monitoring stopped' }
            break
          default:
            throw new Error(`Unknown network action: ${action}`)
        }
        
        return { action, result }
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.state',
      description: 'Manage cookies and browser storage',
      parameters: {
        sessionId: { type: 'string', required: true },
        action: { type: 'string', required: true },
        key: { type: 'string', required: false },
        value: { type: 'string', required: false },
        domain: { type: 'string', required: false }
      },
      handler: async (params: Record<string, any>) => {
        const action = params['action'] as string
        const sessionId = params['sessionId'] as string
        let result: any
        
        switch (action) {
          case 'getCookies':
            result = await browserManager.getCookies(sessionId, params['domain'])
            break
          case 'setCookie':
            if (!params['key'] || !params['value']) {
              throw new Error('Cookie name and value are required')
            }
            await browserManager.setCookie(sessionId, { 
              name: params['key'], 
              value: params['value'], 
              domain: params['domain'] 
            })
            result = { message: 'Cookie set successfully' }
            break
          case 'deleteCookie':
            if (!params['key']) {
              throw new Error('Cookie name is required')
            }
            await browserManager.deleteCookie(sessionId, params['key'], params['domain'])
            result = { message: 'Cookie deleted successfully' }
            break
          case 'getLocalStorage':
            result = await browserManager.getLocalStorage(sessionId)
            break
          case 'setLocalStorageItem':
            if (!params['key'] || !params['value']) {
              throw new Error('Key and value are required')
            }
            await browserManager.setLocalStorageItem(sessionId, params['key'], params['value'])
            result = { message: 'Local storage item set successfully' }
            break
          default:
            throw new Error(`Unknown state action: ${action}`)
        }
        
        return { action, result }
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.inspect',
      description: 'Inspect browser page and get detailed information',
      parameters: {
        url: { type: 'string', required: true }
      },
      handler: async (params: Record<string, any>) => {
        const url = params['url'] as string
        const sessionId = `inspect_${Date.now()}`
        
        // Create session and navigate
        await browserManager.createSession(sessionId, url)
        await browserManager.navigateToUrl(sessionId, url)
        
        // Get page information
        const html = await browserManager.executeJavaScript(sessionId, 'document.documentElement.outerHTML')
        const text = await browserManager.executeJavaScript(sessionId, 'document.body.textContent || ""')
        
        // Close session
        await browserManager.closeSession(sessionId)
        
        return {
          url,
          sessionId,
          html,
          text,
          timestamp: new Date().toISOString()
        }
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.closeSession',
      description: 'Close a browser session',
      parameters: {
        sessionId: { type: 'string', required: true }
      },
      handler: async (params: Record<string, any>) => {
        await browserManager.closeSession(params['sessionId'] as string)
        return { success: true }
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.getSessions',
      description: 'Get all browser sessions',
      parameters: {},
      handler: async () => {
        return browserManager.getAllSessions()
      }
    }))

    // AI-powered element finding
    await this.registerTool(createBrowserTool({
      name: 'browser.find_element_ai',
      description: 'Find element using AI-powered natural language description',
      parameters: {
        sessionId: { type: 'string', required: true },
        description: { type: 'string', required: true },
        context: { type: 'object', required: false }
      },
      handler: async (params: Record<string, any>) => {
        const result = await browserManager.findElementByDescription(
          params['sessionId'] as string,
          params['description'] as string,
          params['context'] as Record<string, any>
        )
        return result
      }
    }))

    // Robust selector generation
    await this.registerTool(createBrowserTool({
      name: 'browser.generate_selectors',
      description: 'Generate multiple robust selectors for an element',
      parameters: {
        sessionId: { type: 'string', required: true },
        elementSelector: { type: 'string', required: true }
      },
      handler: async (params: Record<string, any>) => {
        const strategies = await browserManager.generateRobustSelectors(
          params['sessionId'] as string,
          params['elementSelector'] as string
        )
        return { strategies }
      }
    }))

    // Semantic page analysis
    await this.registerTool(createBrowserTool({
      name: 'browser.analyze_page_semantics',
      description: 'Analyze page structure and element relationships',
      parameters: {
        sessionId: { type: 'string', required: true }
      },
      handler: async (params: Record<string, any>) => {
        const map = await browserManager.analyzePageSemanticsAI(
          params['sessionId'] as string
        )
        return map
      }
    }))

    // Register console inspection tools
    await this.registerTool(createBrowserTool({
      name: 'browser.startConsoleInspection',
      description: 'Start capturing console logs from a browser session',
      parameters: {
        sessionId: { type: 'string', required: true },
        includeErrors: { type: 'boolean', required: false },
        includeWarnings: { type: 'boolean', required: false },
        includeInfo: { type: 'boolean', required: false },
        includeLogs: { type: 'boolean', required: false },
        includeDebug: { type: 'boolean', required: false },
        maxLogs: { type: 'number', required: false },
        captureStackTraces: { type: 'boolean', required: false },
        captureSourceInfo: { type: 'boolean', required: false }
      },
      handler: async (params: Record<string, any>) => {
        const options = {
          includeErrors: params['includeErrors'] as boolean,
          includeWarnings: params['includeWarnings'] as boolean,
          includeInfo: params['includeInfo'] as boolean,
          includeLogs: params['includeLogs'] as boolean,
          includeDebug: params['includeDebug'] as boolean,
          maxLogs: params['maxLogs'] as number,
          captureStackTraces: params['captureStackTraces'] as boolean,
          captureSourceInfo: params['captureSourceInfo'] as boolean
        }
        
        return await browserManager.startConsoleInspection(
          params['sessionId'] as string,
          options
        )
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.getConsoleLogs',
      description: 'Retrieve captured console logs from a browser session',
      parameters: {
        sessionId: { type: 'string', required: true },
        level: { type: 'string', required: false },
        limit: { type: 'number', required: false },
        clearAfter: { type: 'boolean', required: false }
      },
      handler: async (params: Record<string, any>) => {
        const options = {
          level: params['level'] as 'log' | 'info' | 'warn' | 'error' | 'debug',
          limit: params['limit'] as number,
          clearAfter: params['clearAfter'] as boolean
        }
        
        return await browserManager.getConsoleLogs(
          params['sessionId'] as string,
          options
        )
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.clearConsoleLogs',
      description: 'Clear all console logs for a browser session',
      parameters: {
        sessionId: { type: 'string', required: true }
      },
      handler: async (params: Record<string, any>) => {
        await browserManager.clearConsoleLogs(params['sessionId'] as string)
        return { success: true }
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.stopConsoleInspection',
      description: 'Stop console inspection for a browser session',
      parameters: {
        sessionId: { type: 'string', required: true }
      },
      handler: async (params: Record<string, any>) => {
        return await browserManager.stopConsoleInspection(params['sessionId'] as string)
      }
    }))

    await this.registerTool(createBrowserTool({
      name: 'browser.exportConsoleLogs',
      description: 'Export console logs in specified format',
      parameters: {
        sessionId: { type: 'string', required: true },
        format: { type: 'string', required: true },
        includeMetadata: { type: 'boolean', required: false },
        includeStackTraces: { type: 'boolean', required: false },
        includeSourceInfo: { type: 'boolean', required: false },
        filterByLevel: { type: 'array', required: false }
      },
      handler: async (params: Record<string, any>) => {
        const options = {
          format: params['format'] as 'json' | 'text' | 'csv',
          includeMetadata: params['includeMetadata'] as boolean,
          includeStackTraces: params['includeStackTraces'] as boolean,
          includeSourceInfo: params['includeSourceInfo'] as boolean,
          filterByLevel: params['filterByLevel'] as ('log' | 'info' | 'warn' | 'error' | 'debug')[]
        }
        
        return await browserManager.exportConsoleLogs(
          params['sessionId'] as string,
          options
        )
      }
    }))

    console.log('✅ Debug: Browser tools registered successfully')
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
        port: 3001,
        endpoint: '/sse'
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