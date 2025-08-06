import puppeteer, { Browser, Page, CDPSession } from 'puppeteer'
import { EventEmitter } from 'events'

export interface CDPConnection {
  browser: Browser
  page: Page
  cdpSession: CDPSession
  isActive: boolean
  lastActivity: Date
}

export interface CDPConnectionOptions {
  headless?: boolean | "new"
  args?: string[]
  timeout?: number
  maxConnections?: number
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

  constructor(options: CDPConnectionOptions = {}) {
    super()
    this.options = {
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],
      timeout: 30000,
      maxConnections: 5,
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
      
      const testBrowser = await puppeteer.launch(testOptions)
      await testBrowser.close()
      
      this.isInitialized = true
      this.emit('initialized')
    } catch (error) {
      throw new Error(`Failed to initialize CDP Connection Manager: ${error}`)
    }
  }

  async createConnection(sessionId: string): Promise<CDPConnection> {
    if (!this.isInitialized) {
      throw new Error('CDP Connection Manager not initialized')
    }

    if (this.connections.size >= this.maxConnections) {
      throw new Error('Maximum number of connections reached')
    }

    try {
      const browserOptions: any = {}
      if (this.options.headless !== undefined) {
        browserOptions.headless = this.options.headless
      }
      if (this.options.args) {
        browserOptions.args = this.options.args
      }
      
      const browser = await puppeteer.launch(browserOptions)

      const page = await browser.newPage()
      const cdpSession = await page.target().createCDPSession()

      const connection: CDPConnection = {
        browser,
        page,
        cdpSession,
        isActive: true,
        lastActivity: new Date()
      }

      this.connections.set(sessionId, connection)
      this.emit('connectionCreated', sessionId)

      return connection
    } catch (error) {
      throw new Error(`Failed to create CDP connection: ${error}`)
    }
  }

  async getConnection(sessionId: string): Promise<CDPConnection | null> {
    const connection = this.connections.get(sessionId)
    if (connection && connection.isActive) {
      connection.lastActivity = new Date()
      return connection
    }
    return null
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

  async getPageInfo(sessionId: string): Promise<{
    url: string
    title: string
    viewport: { width: number; height: number }
    userAgent: string
  }> {
    const connection = await this.getConnection(sessionId)
    if (!connection) {
      throw new Error('Connection not found or inactive')
    }

    const page = connection.page
    const [url, title, userAgent] = await Promise.all([
      page.url(),
      page.title(),
      page.evaluate(() => {
        try {
          return (globalThis as any).navigator?.userAgent || 'Unknown'
        } catch {
          return 'Unknown'
        }
      })
    ])

    const viewport = await page.viewport()

    return {
      url,
      title,
      viewport: viewport || { width: 1920, height: 1080 },
      userAgent
    }
  }

  async closeConnection(sessionId: string): Promise<void> {
    const connection = this.connections.get(sessionId)
    if (!connection) {
      return
    }

    try {
      connection.isActive = false
      await connection.browser.close()
      this.connections.delete(sessionId)
      this.emit('connectionClosed', sessionId)
    } catch (error) {
      console.error(`Error closing connection ${sessionId}:`, error)
    }
  }

  async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(this.connections.keys()).map(sessionId =>
      this.closeConnection(sessionId)
    )
    await Promise.all(closePromises)
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

  async shutdown(): Promise<void> {
    await this.closeAllConnections()
    this.isInitialized = false
    this.emit('shutdown')
  }
} 