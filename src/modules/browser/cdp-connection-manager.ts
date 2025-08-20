import puppeteer, { Browser, Page, CDPSession } from 'puppeteer'
import { EventEmitter } from 'events'
import { convertHeadlessParameter } from './browser-utils.js'

export interface CDPConnection {
  browser: Browser
  page: Page
  cdpSession: CDPSession
  isActive: boolean
  lastActivity: Date
  enabledDomains: Set<string>
  connectionHealth: ConnectionHealth
}

export interface ConnectionHealth {
  isHealthy: boolean
  lastCheck: Date
  errorCount: number
  domainStatus: Record<string, boolean>
}

export interface CDPConnectionOptions {
  headless?: boolean | "new"
  args?: string[]
  timeout?: number
  maxConnections?: number
  executablePath?: string
  enableDomains?: string[]
}

export interface CDPRequest {
  id: string
  method: string
  params?: any
}

export interface CDPResponse {
  id: string
  result?: any
  error?: {
    code: number
    message: string
  }
}

export class CDPConnectionManager extends EventEmitter {
  private connections: Map<string, CDPConnection> = new Map()
  private options: CDPConnectionOptions
  private maxConnections: number
  private isInitialized: boolean = false
  private healthCheckInterval: NodeJS.Timeout | null = null

  constructor(options: CDPConnectionOptions = {}) {
    super()
    this.options = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--disable-gpu'
      ],
      timeout: 30000,
      maxConnections: 5,
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      enableDomains: ['Runtime', 'Network', 'Page', 'DOM', 'Storage'],
      ...options
    }
    this.maxConnections = this.options.maxConnections!
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      // Test connection to ensure Puppeteer is working
      const testOptions: any = {}
      if (this.options.headless !== undefined) {
        testOptions.headless = this.options.headless
      }
      if (this.options.args) {
        testOptions.args = this.options.args
      }
      if (this.options.executablePath) {
        testOptions.executablePath = this.options.executablePath
      }
      
      const testBrowser = await puppeteer.launch(testOptions)
      await testBrowser.close()
      
      // Start health check monitoring
      this.startHealthCheckMonitoring()
      
      this.isInitialized = true
      this.emit('initialized')
    } catch (error) {
      throw new Error(`Failed to initialize CDP Connection Manager: ${error}`)
    }
  }

  private startHealthCheckMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }
    
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks()
    }, 30000) // Check every 30 seconds
  }

  private async performHealthChecks(): Promise<void> {
    for (const [sessionId, connection] of this.connections) {
      try {
        await this.validateConnectionHealth(sessionId, connection)
      } catch (error) {
        console.error(`Health check failed for session ${sessionId}:`, error)
        this.emit('connectionUnhealthy', sessionId, error)
      }
    }
  }

  private async validateConnectionHealth(sessionId: string, connection: CDPConnection): Promise<void> {
    try {
      // Check if page is still accessible
      const isClosed = connection.page.isClosed()
      if (isClosed) {
        connection.isActive = false
        connection.connectionHealth.isHealthy = false
        this.emit('connectionLost', sessionId)
        return
      }

      // Validate CDP session
      await connection.cdpSession.send('Runtime.evaluate', { expression: '1+1' })
      
      // Update health status
      connection.connectionHealth.isHealthy = true
      connection.connectionHealth.lastCheck = new Date()
      connection.connectionHealth.errorCount = 0
      
    } catch (error) {
      connection.connectionHealth.isHealthy = false
      connection.connectionHealth.errorCount++
      connection.lastActivity = new Date()
      
      if (connection.connectionHealth.errorCount > 3) {
        connection.isActive = false
        this.emit('connectionFailed', sessionId, error)
      }
    }
  }

  async createConnection(sessionId: string, sessionOptions?: { headless?: boolean | "new" }): Promise<CDPConnection> {
    if (!this.isInitialized) {
      throw new Error('CDP Connection Manager not initialized')
    }

    if (this.connections.size >= this.maxConnections) {
      throw new Error('Maximum number of connections reached')
    }

    try {
      console.log(`🔧 [CDP] Creating connection for session: ${sessionId}`)
      console.log(`🔧 [CDP] Current connections count: ${this.connections.size}`)
      
      const browserOptions: any = {}
      
      // Use session-specific headless option if provided, otherwise use default
      const headlessValue = convertHeadlessParameter(
        sessionOptions?.headless !== undefined ? sessionOptions.headless : this.options.headless
      )
      
      browserOptions.headless = headlessValue
      
      console.log(`🔧 [CDP] Headless parameter processing:`, {
        sessionOptionsHeadless: sessionOptions?.headless,
        defaultHeadless: this.options.headless,
        finalHeadlessValue: headlessValue,
        type: typeof headlessValue,
        isHeadless: headlessValue === true || headlessValue === "new",
        isVisible: headlessValue === false
      })
      
      // Start with base arguments
      const args = [...(this.options.args || [])]
      
      // Add visibility-enhancing arguments when not headless
      if (headlessValue === false) {
        console.log(`🔧 [CDP] Non-headless mode detected, adding visibility arguments`)
        args.push(
          '--start-maximized',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-background-networking'
        )
        // Remove arguments that might interfere with visibility
        const argsToRemove = [
          '--disable-gpu',
          '--disable-features=VizDisplayCompositor'
        ]
        browserOptions.args = args.filter(arg => !argsToRemove.includes(arg))
        console.log(`🔧 [CDP] Final args for non-headless mode:`, browserOptions.args)
      } else {
        browserOptions.args = args
        console.log(`🔧 [CDP] Final args for headless mode:`, browserOptions.args)
      }
      
      if (this.options.executablePath) {
        browserOptions.executablePath = this.options.executablePath
      }
      
      console.log(`🔧 [CDP] Launching browser with options:`, {
        headless: browserOptions.headless,
        args: browserOptions.args,
        executablePath: browserOptions.executablePath
      })

      const browser = await puppeteer.launch(browserOptions)
      const page = await browser.newPage()
      const cdpSession = await page.target().createCDPSession()

      // Enable required CDP domains
      await this.enableCDPDomains(cdpSession, sessionId)

      const connection: CDPConnection = {
        browser,
        page,
        cdpSession,
        isActive: true,
        lastActivity: new Date(),
        enabledDomains: new Set(this.options.enableDomains || []),
        connectionHealth: {
          isHealthy: true,
          lastCheck: new Date(),
          errorCount: 0,
          domainStatus: {}
        }
      }

      this.connections.set(sessionId, connection)
      
      // Set up page event listeners for monitoring
      this.setupPageEventListeners(page, sessionId)
      
      console.log(`🔧 [CDP] Connection created successfully for session: ${sessionId}`)
      this.emit('connectionCreated', sessionId, connection)
      
      return connection
    } catch (error) {
      console.error(`🔧 [CDP] Failed to create connection for session ${sessionId}:`, error)
      throw new Error(`Failed to create CDP connection: ${error}`)
    }
  }

  private async enableCDPDomains(cdpSession: CDPSession, sessionId: string): Promise<void> {
    const domainsToEnable = this.options.enableDomains || ['Runtime', 'Network', 'Page', 'DOM', 'Storage']
    
    for (const domain of domainsToEnable) {
      try {
        switch (domain) {
          case 'Runtime':
            await cdpSession.send('Runtime.enable')
            console.log(`🔧 [CDP] Runtime domain enabled for session: ${sessionId}`)
            break
          case 'Network':
            await cdpSession.send('Network.enable')
            console.log(`🔧 [CDP] Network domain enabled for session: ${sessionId}`)
            break
          case 'Page':
            await cdpSession.send('Page.enable')
            console.log(`🔧 [CDP] Page domain enabled for session: ${sessionId}`)
            break
          case 'DOM':
            await cdpSession.send('DOM.enable')
            console.log(`🔧 [CDP] DOM domain enabled for session: ${sessionId}`)
            break
          case 'Storage':
            // Note: Storage domain may not be available in all CDP versions
            try {
              await cdpSession.send('Storage.enable' as any)
              console.log(`🔧 [CDP] Storage domain enabled for session: ${sessionId}`)
            } catch (error) {
              console.warn(`🔧 [CDP] Storage domain not available for session ${sessionId}:`, error)
            }
            break
          default:
            console.warn(`🔧 [CDP] Unknown domain: ${domain}`)
        }
      } catch (error) {
        console.error(`🔧 [CDP] Failed to enable ${domain} domain for session ${sessionId}:`, error)
        throw new Error(`Failed to enable ${domain} domain: ${error}`)
      }
    }
  }

  private setupPageEventListeners(page: Page, sessionId: string): void {
    page.on('close', () => {
      console.log(`🔧 [CDP] Page closed for session: ${sessionId}`)
      const connection = this.connections.get(sessionId)
      if (connection) {
        connection.isActive = false
        connection.connectionHealth.isHealthy = false
      }
      this.emit('pageClosed', sessionId)
    })

    page.on('error', (error) => {
      console.error(`🔧 [CDP] Page error for session ${sessionId}:`, error)
      const connection = this.connections.get(sessionId)
      if (connection) {
        connection.connectionHealth.isHealthy = false
        connection.connectionHealth.errorCount++
      }
      this.emit('pageError', sessionId, error)
    })

    page.on('pageerror', (error) => {
      console.error(`🔧 [CDP] Page JavaScript error for session ${sessionId}:`, error)
      this.emit('pageJavaScriptError', sessionId, error)
    })
  }

  async getConnection(sessionId: string): Promise<CDPConnection | undefined> {
    const connection = this.connections.get(sessionId)
    if (connection && connection.isActive) {
      connection.lastActivity = new Date()
      return connection
    }
    return undefined
  }

  async validateConnection(sessionId: string): Promise<boolean> {
    const connection = await this.getConnection(sessionId)
    if (!connection) {
      return false
    }

    try {
      // Quick health check
      await connection.cdpSession.send('Runtime.evaluate', { expression: '1+1' })
      return true
    } catch (error) {
      console.error(`🔧 [CDP] Connection validation failed for session ${sessionId}:`, error)
      return false
    }
  }

  async getPageInfo(sessionId: string): Promise<{ title: string; url: string }> {
    const connection = await this.getConnection(sessionId)
    if (!connection) {
      throw new Error('Connection not found')
    }

    try {
      const title = await connection.page.title()
      const url = connection.page.url()
      return { title, url }
    } catch (error) {
      throw new Error(`Failed to get page info: ${error}`)
    }
  }

  async closeConnection(sessionId: string): Promise<void> {
    const connection = this.connections.get(sessionId)
    if (!connection) {
      return
    }

    try {
      console.log(`🔧 [CDP] Closing connection for session: ${sessionId}`)
      
      if (!connection.page.isClosed()) {
        await connection.page.close()
      }
      
      if (!connection.browser.isConnected()) {
        await connection.browser.close()
      }
      
      this.connections.delete(sessionId)
      this.emit('connectionClosed', sessionId)
      
      console.log(`🔧 [CDP] Connection closed successfully for session: ${sessionId}`)
    } catch (error) {
      console.error(`🔧 [CDP] Failed to close connection for session ${sessionId}:`, error)
      // Force remove from connections map even if cleanup fails
      this.connections.delete(sessionId)
      throw new Error(`Failed to close connection: ${error}`)
    }
  }

  async shutdown(): Promise<void> {
    console.log(`🔧 [CDP] Shutting down CDP Connection Manager`)
    
    // Stop health check monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
    
    // Close all connections
    const closePromises = Array.from(this.connections.keys()).map(sessionId => 
      this.closeConnection(sessionId)
    )
    
    await Promise.allSettled(closePromises)
    this.connections.clear()
    this.isInitialized = false
    
    console.log(`🔧 [CDP] CDP Connection Manager shutdown complete`)
  }

  async closeAllConnections(): Promise<void> {
    console.log(`🔧 [CDP] Closing all connections`)
    
    const closePromises = Array.from(this.connections.keys()).map(sessionId => 
      this.closeConnection(sessionId)
    )
    
    await Promise.allSettled(closePromises)
    this.connections.clear()
    
    console.log(`🔧 [CDP] All connections closed`)
  }

  async executeCDPCommand(sessionId: string, request: CDPRequest): Promise<CDPResponse> {
    const connection = await this.getConnection(sessionId)
    if (!connection) {
      throw new Error('Connection not found or inactive')
    }

    try {
      // Use any type for method to bypass strict typing
      const result = await connection.cdpSession.send(request.method as any, request.params || {})
      return {
        id: request.id,
        result
      }
    } catch (error) {
      return {
        id: request.id,
        error: {
          code: 1,
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  async navigateToUrl(sessionId: string, url: string): Promise<void> {
    const connection = await this.getConnection(sessionId)
    if (!connection) {
      throw new Error('Connection not found or inactive')
    }

    try {
      const gotoOptions: any = {
        waitUntil: 'networkidle2'
      }
      if (this.options.timeout !== undefined) {
        gotoOptions.timeout = this.options.timeout
      }
      
      await connection.page.goto(url, gotoOptions)
      this.emit('navigated', sessionId, url)
    } catch (error) {
      throw new Error(`Failed to navigate to ${url}: ${error}`)
    }
  }

  getConnectionCount(): number {
    return this.connections.size
  }

  getActiveConnections(): string[] {
    return Array.from(this.connections.entries())
      .filter(([_, connection]) => connection.isActive)
      .map(([sessionId, _]) => sessionId)
  }

  getConnectionHealth(sessionId: string): ConnectionHealth | undefined {
    const connection = this.connections.get(sessionId)
    return connection?.connectionHealth
  }

  getConnectionStats(): {
    totalConnections: number
    activeConnections: number
    maxConnections: number
  } {
    const activeConnections = Array.from(this.connections.values()).filter(
      conn => conn.isActive
    ).length

    return {
      totalConnections: this.connections.size,
      activeConnections,
      maxConnections: this.maxConnections
    }
  }

  isReady(): boolean {
    return this.isInitialized
  }
} 