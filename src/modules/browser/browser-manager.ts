import { CDPConnectionManager } from './cdp-connection-manager.js'
import { DOMInspector } from './dom-inspector.js'
import { VueComponentMapper } from './vue-component-mapper.js'
import { BrowserSecurityManager } from './browser-security-manager.js'
import { EventEmitter } from 'events'

export interface BrowserSession {
  sessionId: string
  url: string
  title: string
  isActive: boolean
  createdAt: Date
  lastActivity: Date
}

export interface BrowserInspectionResult {
  sessionId: string
  url: string
  title: string
  domElements: number
  vueComponents: number
  inspectionTime: number
  securityValidation: any
}

export interface BrowserOperation {
  type: 'navigate' | 'inspect' | 'map' | 'screenshot' | 'execute'
  sessionId: string
  url?: string
  options?: any
  timestamp: Date
}

export class BrowserManager extends EventEmitter {
  private cdpManager: CDPConnectionManager
  private domInspector: DOMInspector
  private vueMapper: VueComponentMapper
  private securityManager: BrowserSecurityManager
  private sessions: Map<string, BrowserSession> = new Map()
  private operations: BrowserOperation[] = []
  private isInitialized: boolean = false

  constructor() {
    super()
    
    this.securityManager = new BrowserSecurityManager()
    this.cdpManager = new CDPConnectionManager({
      args: this.securityManager.getBrowserArgs()
    })
    this.domInspector = new DOMInspector(this.cdpManager)
    this.vueMapper = new VueComponentMapper(this.domInspector)
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      await Promise.all([
        this.securityManager.initialize(),
        this.cdpManager.initialize()
      ])

      this.isInitialized = true
      this.emit('initialized')
    } catch (error) {
      throw new Error(`Failed to initialize Browser Manager: ${error}`)
    }
  }

  async createSession(sessionId: string, url?: string): Promise<BrowserSession> {
    if (!this.isInitialized) {
      throw new Error('Browser Manager not initialized')
    }

    // Validate URL if provided
    if (url) {
      const validation = await this.securityManager.validateUrl(url)
      if (!validation.isValid) {
        throw new Error(`URL validation failed: ${validation.reason}`)
      }
    }

    // Create CDP connection
    await this.cdpManager.createConnection(sessionId)

    const session: BrowserSession = {
      sessionId,
      url: url || '',
      title: '',
      isActive: true,
      createdAt: new Date(),
      lastActivity: new Date()
    }

    this.sessions.set(sessionId, session)
    this.emit('sessionCreated', session)

    // Navigate to URL if provided
    if (url) {
      await this.navigateToUrl(sessionId, url)
    }

    return session
  }

  async navigateToUrl(sessionId: string, url: string): Promise<void> {
    // Validate URL
    const validation = await this.securityManager.validateUrl(url)
    if (!validation.isValid) {
      throw new Error(`URL validation failed: ${validation.reason}`)
    }

    // Check if URL is blocked
    if (this.securityManager.isUrlBlocked(url)) {
      throw new Error('URL is blocked by security policy')
    }

    // Navigate using CDP
    await this.cdpManager.navigateToUrl(sessionId, url)

    // Update session
    const session = this.sessions.get(sessionId)
    if (session) {
      session.url = url
      session.lastActivity = new Date()
      
      // Get page info
      const pageInfo = await this.cdpManager.getPageInfo(sessionId)
      session.title = pageInfo.title
    }

    this.logOperation({
      type: 'navigate',
      sessionId,
      url,
      timestamp: new Date()
    })

    this.emit('navigated', sessionId, url)
  }

  async inspectPage(sessionId: string, options: {
    includeComputedStyles?: boolean
    includeBoundingBox?: boolean
    includeVisibility?: boolean
    maxDepth?: number
  } = {}): Promise<BrowserInspectionResult> {
    const startTime = Date.now()

    // Get page info
    const pageInfo = await this.cdpManager.getPageInfo(sessionId)
    
    // Get DOM document
    const document = await this.domInspector.getDocument(sessionId)
    
    // Count DOM elements
    const domElements = this.countDOMElements(document)
    
    // Map Vue components
    const vueMappingOptions: any = {
      includeProps: true,
      includeData: true,
      includeComputed: true,
      includeMethods: true,
      includeEvents: true,
      includeTemplate: true
    }
    
    if (options.maxDepth !== undefined) {
      vueMappingOptions.maxDepth = options.maxDepth
    }

    const vueMapping = await this.vueMapper.mapVueComponents(sessionId, vueMappingOptions)

    const inspectionTime = Date.now() - startTime

    // Validate page content for security
    const contentValidation = await this.securityManager.validateContent(document.nodeValue || '')

    const result: BrowserInspectionResult = {
      sessionId,
      url: pageInfo.url,
      title: pageInfo.title,
      domElements,
      vueComponents: vueMapping.components.length,
      inspectionTime,
      securityValidation: contentValidation
    }

    this.logOperation({
      type: 'inspect',
      sessionId,
      options,
      timestamp: new Date()
    })

    this.emit('pageInspected', sessionId, result)
    return result
  }

  async mapVueComponents(sessionId: string, options: any = {}): Promise<any> {
    const mapping = await this.vueMapper.mapVueComponents(sessionId, options)
    
    this.logOperation({
      type: 'map',
      sessionId,
      options,
      timestamp: new Date()
    })

    this.emit('componentsMapped', sessionId, mapping)
    return mapping
  }

  async takeScreenshot(sessionId: string, options: {
    fullPage?: boolean
    quality?: number
    type?: 'png' | 'jpeg'
  } = {}): Promise<Buffer> {
    const connection = await this.cdpManager.getConnection(sessionId)
    if (!connection) {
      throw new Error('Session not found or inactive')
    }

    const screenshot = await connection.page.screenshot({
      fullPage: options.fullPage || false,
      quality: options.quality || 80,
      type: options.type || 'png'
    })

    this.logOperation({
      type: 'screenshot',
      sessionId,
      options,
      timestamp: new Date()
    })

    this.emit('screenshotTaken', sessionId)
    return screenshot
  }

  async executeJavaScript(sessionId: string, script: string): Promise<any> {
    // Validate script for security
    const validation = await this.securityManager.validateContent(script)
    if (!validation.isValid) {
      throw new Error(`Script validation failed: ${validation.reason}`)
    }

    const connection = await this.cdpManager.getConnection(sessionId)
    if (!connection) {
      throw new Error('Session not found or inactive')
    }

    const result = await connection.page.evaluate(script)

    this.logOperation({
      type: 'execute',
      sessionId,
      options: { script },
      timestamp: new Date()
    })

    this.emit('scriptExecuted', sessionId, result)
    return result
  }

  async getElementInfo(sessionId: string, selector: string): Promise<any> {
    const element = await this.domInspector.querySelector(sessionId, selector)
    if (!element) {
      return null
    }

    const detailedElement = await this.domInspector.inspectElement(sessionId, element.nodeId, {
      includeComputedStyles: true,
      includeBoundingBox: true,
      includeVisibility: true
    })

    return detailedElement
  }

  async searchElements(sessionId: string, criteria: any): Promise<any[]> {
    return await this.domInspector.searchElements(sessionId, criteria)
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.cdpManager.closeConnection(sessionId)
    
    const session = this.sessions.get(sessionId)
    if (session) {
      session.isActive = false
      this.sessions.delete(sessionId)
      this.emit('sessionClosed', sessionId)
    }
  }

  async closeAllSessions(): Promise<void> {
    await this.cdpManager.closeAllConnections()
    this.sessions.clear()
    this.emit('allSessionsClosed')
  }

  getSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId)
  }

  getAllSessions(): BrowserSession[] {
    return Array.from(this.sessions.values())
  }

  getActiveSessions(): BrowserSession[] {
    return Array.from(this.sessions.values()).filter(session => session.isActive)
  }

  getOperationHistory(): BrowserOperation[] {
    return [...this.operations]
  }

  getBrowserStats(): {
    totalSessions: number
    activeSessions: number
    totalOperations: number
    cdpStats: any
    securityPolicy: any
  } {
    return {
      totalSessions: this.sessions.size,
      activeSessions: this.getActiveSessions().length,
      totalOperations: this.operations.length,
      cdpStats: this.cdpManager.getConnectionStats(),
      securityPolicy: this.securityManager.getSecurityPolicy()
    }
  }

  updateSecurityPolicy(policy: any): void {
    this.securityManager.updateSecurityPolicy(policy)
  }

  addBlockedUrl(url: string): void {
    this.securityManager.addBlockedUrl(url)
  }

  removeBlockedUrl(url: string): void {
    this.securityManager.removeBlockedUrl(url)
  }

  private countDOMElements(element: any): number {
    let count = 1 // Count current element
    if (element.children) {
      for (const child of element.children) {
        count += this.countDOMElements(child)
      }
    }
    return count
  }

  private logOperation(operation: BrowserOperation): void {
    this.operations.push(operation)
    
    // Keep only last 1000 operations
    if (this.operations.length > 1000) {
      this.operations = this.operations.slice(-1000)
    }
  }

  isReady(): boolean {
    return this.isInitialized
  }

  async shutdown(): Promise<void> {
    await Promise.all([
      this.closeAllSessions(),
      this.cdpManager.shutdown(),
      this.securityManager.shutdown()
    ])
    
    this.isInitialized = false
    this.emit('shutdown')
  }
} 