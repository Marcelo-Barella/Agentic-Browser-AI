import { CDPConnectionManager } from './cdp-connection-manager.js'
import { DOMInspector } from './dom-inspector.js'
import { VueComponentMapper } from './vue-component-mapper.js'
import { BrowserSecurityManager } from './browser-security-manager.js'
import { PageController } from './page-controller.js'
import { ScreenshotService } from './screenshot-service.js'
import { NetworkMonitor } from './network-monitor.js'
import { JavaScriptExecutor } from './js-executor.js'
import { StateManager } from './state-manager.js'
import { EventEmitter } from 'events'
import { AIElementSelectorImpl, ElementMatch, SelectorStrategy, PageSemanticMap, DynamicStrategy } from './ai-element-selector.js'
import { VisualTestingService, VisualTestConfig, VisualTestResult } from '../testing/visual-testing.js'
import { PerformanceTestingService, PerformanceTestResult } from '../testing/performance-testing.js'
import { ArtifactManager, RecordingOptions, RecordingResult, TestArtifact } from '../testing/artifact-manager.js'
import { convertHeadlessParameter } from './browser-utils.js'
import { ConsoleInspectionOptions, ConsoleExportOptions } from './console-types.js'
import { ErrorHandler } from '../../core/error-handler.js'

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
  type: 'navigate' | 'inspect' | 'map' | 'screenshot' | 'execute' | 'intelligentScreenshot' | 'captureContentArea' | 'captureInteractiveElements' | 'captureErrorStates' | 'captureSemanticRegion'
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
  private pageController: PageController
  private screenshotService: ScreenshotService
  private networkMonitor: NetworkMonitor
  private jsExecutor: JavaScriptExecutor
  private stateManager: StateManager
  private aiSelector?: AIElementSelectorImpl
  private visualTesting: VisualTestingService
  private performanceTesting: PerformanceTestingService
  private artifactManager: ArtifactManager
  private errorHandler: ErrorHandler
  private sessions: Map<string, BrowserSession> = new Map()
  private operations: BrowserOperation[] = []
  private isInitialized: boolean = false

  constructor() {
    super()
    
    this.errorHandler = new ErrorHandler()
    this.securityManager = new BrowserSecurityManager({
      allowedDomains: [] // Empty array allows all domains
    })
    this.cdpManager = new CDPConnectionManager({
      args: this.securityManager.getBrowserArgs()
    })
    this.domInspector = new DOMInspector(this.cdpManager)
    this.vueMapper = new VueComponentMapper(this.domInspector)
    this.pageController = new PageController(this.cdpManager)
    this.screenshotService = new ScreenshotService(this.cdpManager)
    this.networkMonitor = new NetworkMonitor(this.cdpManager)
    this.jsExecutor = new JavaScriptExecutor(this.cdpManager)
    this.stateManager = new StateManager(this.cdpManager)
    this.aiSelector = new AIElementSelectorImpl(this.domInspector, this.jsExecutor)
    this.visualTesting = new VisualTestingService()
    this.performanceTesting = new PerformanceTestingService()
    this.artifactManager = new ArtifactManager()
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      await Promise.all([
        this.errorHandler.initialize(),
        this.securityManager.initialize(),
        this.cdpManager.initialize(),
        this.pageController.initialize(),
        this.screenshotService.initialize(),
        this.networkMonitor.initialize(),
        this.jsExecutor.initialize(),
        this.stateManager.initialize()
      ])

      this.isInitialized = true
      this.emit('initialized')
    } catch (error) {
      throw new Error(`Failed to initialize Browser Manager: ${error}`)
    }
  }

  async runVisualTest(sessionId: string, testName: string, config: VisualTestConfig): Promise<VisualTestResult> {
    const safeName = testName.replace(/[^a-z0-9_-]/gi, '_')
    const currentFile = `${sessionId}_${safeName}.png`
    const screenshot = await this.screenshotService.captureScreenshot(sessionId, { type: 'png', path: currentFile })
    const baselinePath = await this.visualTesting.captureBaseline(sessionId, testName)
    const diff = await this.visualTesting.compareWithBaseline(sessionId, testName)
    return {
      sessionId,
      testName,
      passed: diff.passed,
      baselinePath,
      currentPath: screenshot.path || currentFile,
      diff
    }
  }

  async runPerformanceTest(sessionId: string, metrics: string[]): Promise<PerformanceTestResult> {
    const measured = await this.performanceTesting.measurePagePerformance(sessionId)
    return { sessionId, metrics: measured }
  }

  async recordTestSession(sessionId: string, options: RecordingOptions): Promise<RecordingResult> {
    const startedAt = Date.now()
    const stoppedAt = startedAt
    return { sessionId, startedAt, stoppedAt, artifacts: [] }
  }

  async generateTestArtifacts(sessionId: string, testId: string): Promise<TestArtifact[]> {
    return []
  }

  // AI-powered element selection APIs
  async findElementByDescription(sessionId: string, description: string, context?: any): Promise<ElementMatch> {
    if (!this.aiSelector) {
      throw new Error('AI selector not initialized')
    }
    return this.aiSelector.findElementByDescription(sessionId, description, context)
  }

  async generateRobustSelectors(sessionId: string, selector: string): Promise<SelectorStrategy[]> {
    if (!this.aiSelector) {
      throw new Error('AI selector not initialized')
    }
    const el = await this.domInspector.querySelector(sessionId, selector)
    if (!el) throw new Error('Element not found')
    return this.aiSelector.generateRobustSelectors(sessionId, el)
  }

  async analyzePageSemanticsAI(sessionId: string): Promise<PageSemanticMap> {
    if (!this.aiSelector) {
      throw new Error('AI selector not initialized')
    }
    return this.aiSelector.analyzePageSemantics(sessionId)
  }

  async handleDynamicElementsAI(sessionId: string, selector: string): Promise<DynamicStrategy> {
    if (!this.aiSelector) {
      throw new Error('AI selector not initialized')
    }
    const el = await this.domInspector.querySelector(sessionId, selector)
    if (!el) throw new Error('Element not found')
    return this.aiSelector.handleDynamicElements(sessionId, el)
  }

  async createSession(sessionId: string, url?: string, options?: { headless?: boolean | "new" }): Promise<BrowserSession> {
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

    // Create CDP connection with headless option
    const headless = convertHeadlessParameter(options?.headless)
    console.log(`🔧 [BrowserManager] Creating session with headless:`, {
      sessionId,
      url,
      optionsHeadless: options?.headless,
      finalHeadless: headless,
      type: typeof headless,
      isHeadless: headless === true || headless === "new",
      isVisible: headless === false
    })
    
    await this.cdpManager.createConnection(sessionId, { headless })

    // Initialize all managers for this session
    await Promise.all([
      this.pageController.createPage(sessionId, url),
      this.stateManager.createSession(sessionId),
      this.networkMonitor.startMonitoring(sessionId)
    ])

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

    return session
  }

  async navigateToUrl(sessionId: string, url: string, options?: { headless?: boolean | "new" }): Promise<void> {
    // Validate URL
    const validation = await this.securityManager.validateUrl(url)
    if (!validation.isValid) {
      throw new Error(`URL validation failed: ${validation.reason}`)
    }

    // Check if URL is blocked
    if (this.securityManager.isUrlBlocked(url)) {
      throw new Error('URL is blocked by security policy')
    }

    // Check if session exists, if not create it with headless option
    if (!this.sessions.has(sessionId)) {
      await this.createSession(sessionId, url, options)
      return
    }

    // Navigate using Page Controller
    await this.pageController.navigateToUrl(sessionId, url)

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
    quality?: number
    type?: 'png' | 'jpeg'
    path?: string
  } = {}): Promise<any> {
    // Filter out quality parameter for PNG format to avoid Puppeteer errors
    const filteredOptions = { ...options }
    if (filteredOptions.type === 'png' && typeof filteredOptions.quality === 'number') {
      delete filteredOptions.quality
    }
    
    const result = await this.screenshotService.captureScreenshot(sessionId, filteredOptions)

    this.logOperation({
      type: 'screenshot',
      sessionId,
      options,
      timestamp: new Date()
    })

    this.emit('screenshotTaken', sessionId, result)
    return result
  }

  async takeIntelligentScreenshot(sessionId: string, description?: string, options: any = {}): Promise<any> {
    const result = await this.screenshotService.captureIntelligentScreenshot(sessionId, description, options)

    this.logOperation({
      type: 'intelligentScreenshot',
      sessionId,
      options: { description, ...options },
      timestamp: new Date()
    })

    this.emit('intelligentScreenshotTaken', sessionId, result)
    return result
  }

  async captureContentArea(sessionId: string, options: any = {}): Promise<any> {
    const result = await this.screenshotService.captureContentArea(sessionId, options)

    this.logOperation({
      type: 'captureContentArea',
      sessionId,
      options,
      timestamp: new Date()
    })

    this.emit('contentAreaCaptured', sessionId, result)
    return result
  }

  async captureInteractiveElements(sessionId: string, options: any = {}): Promise<any> {
    const result = await this.screenshotService.captureInteractiveElements(sessionId, options)

    this.logOperation({
      type: 'captureInteractiveElements',
      sessionId,
      options,
      timestamp: new Date()
    })

    this.emit('interactiveElementsCaptured', sessionId, result)
    return result
  }

  async captureErrorStates(sessionId: string, options: any = {}): Promise<any> {
    const result = await this.screenshotService.captureErrorStates(sessionId, options)

    this.logOperation({
      type: 'captureErrorStates',
      sessionId,
      options,
      timestamp: new Date()
    })

    this.emit('errorStatesCaptured', sessionId, result)
    return result
  }

  async captureSemanticRegion(sessionId: string, region: string, options: any = {}): Promise<any> {
    const result = await this.screenshotService.captureSemanticRegion(sessionId, region, options)

    this.logOperation({
      type: 'captureSemanticRegion',
      sessionId,
      options: { region, ...options },
      timestamp: new Date()
    })

    this.emit('semanticRegionCaptured', sessionId, result)
    return result
  }

  async executeJavaScript(sessionId: string, script: string, options: any = {}): Promise<any> {
    const result = await this.jsExecutor.executeScript(sessionId, script, options)

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

  async clickElement(sessionId: string, selector: string, options: any = {}): Promise<void> {
    return await this.pageController.clickElement(sessionId, selector, options)
  }

  async fillElement(sessionId: string, selector: string, value: string, options: any = {}): Promise<void> {
    return await this.pageController.fillElement(sessionId, selector, value, options)
  }

  async selectOption(sessionId: string, selector: string, value: string, options: any = {}): Promise<void> {
    return await this.pageController.selectOption(sessionId, selector, value, options)
  }

  async scrollTo(sessionId: string, x: number, y: number): Promise<void> {
    return await this.pageController.scrollTo(sessionId, x, y)
  }

  async setViewport(sessionId: string, options: any): Promise<void> {
    return await this.pageController.setViewport(sessionId, options)
  }

  async goBack(sessionId: string): Promise<void> {
    return await this.pageController.goBack(sessionId)
  }

  async goForward(sessionId: string): Promise<void> {
    return await this.pageController.goForward(sessionId)
  }

  async refresh(sessionId: string): Promise<void> {
    return await this.pageController.refresh(sessionId)
  }

  async waitForElement(sessionId: string, selector: string, options: any = {}): Promise<any> {
    return await this.pageController.waitForElement(sessionId, selector, options)
  }

  async captureElementScreenshot(sessionId: string, selector: string, options: any = {}): Promise<any> {
    return await this.screenshotService.captureElementScreenshot(sessionId, selector, options)
  }

  async generatePDF(sessionId: string, options: any = {}): Promise<any> {
    return await this.screenshotService.generatePDF(sessionId, options)
  }

  async captureVisualAnalysis(sessionId: string, selector?: string): Promise<any> {
    return await this.screenshotService.captureVisualAnalysis(sessionId, selector)
  }

  // Public access methods for managers
  get cdpManagerPublic() {
    return this.cdpManager
  }

  get networkMonitorPublic() {
    return this.networkMonitor
  }

  get stateManagerPublic() {
    return this.stateManager
  }

  get jsExecutorPublic() {
    return this.jsExecutor
  }

  async injectScript(sessionId: string, script: string, options: any = {}): Promise<any> {
    return await this.jsExecutor.injectScript(sessionId, script, options)
  }

  async executeAsyncScript(sessionId: string, script: string, options: any = {}): Promise<any> {
    return await this.jsExecutor.executeAsyncScript(sessionId, script, options)
  }

  async getPerformanceMetrics(sessionId: string): Promise<any> {
    return await this.jsExecutor.getPerformanceMetrics(sessionId)
  }

  async getCookies(sessionId: string, domain?: string): Promise<any> {
    return await this.stateManager.getCookies(sessionId, domain)
  }

  async setCookie(sessionId: string, cookie: any): Promise<void> {
    return await this.stateManager.setCookie(sessionId, cookie)
  }

  async deleteCookie(sessionId: string, name: string, domain?: string): Promise<void> {
    return await this.stateManager.deleteCookie(sessionId, name, domain)
  }

  async getLocalStorage(sessionId: string): Promise<any> {
    return await this.stateManager.getLocalStorage(sessionId)
  }

  async setLocalStorageItem(sessionId: string, key: string, value: string): Promise<void> {
    return await this.stateManager.setLocalStorageItem(sessionId, key, value)
  }

  async getSessionStorage(sessionId: string): Promise<any> {
    return await this.stateManager.getSessionStorage(sessionId)
  }

  async setSessionStorageItem(sessionId: string, key: string, value: string): Promise<void> {
    return await this.stateManager.setSessionStorageItem(sessionId, key, value)
  }

  async saveCredential(sessionId: string, credential: any): Promise<void> {
    return await this.stateManager.saveCredential(sessionId, credential)
  }

  async getCredentials(sessionId: string, type?: string): Promise<any> {
    return await this.stateManager.getCredentials(sessionId, type)
  }

  async saveSessionState(sessionId: string, state: any): Promise<void> {
    return await this.stateManager.saveSessionState(sessionId, state)
  }

  async restoreSessionState(sessionId: string): Promise<any> {
    return await this.stateManager.restoreSessionState(sessionId)
  }

  getPageState(sessionId: string): any {
    return this.pageController.getPageState(sessionId)
  }

  getAllPageStates(): any[] {
    return this.pageController.getAllPageStates()
  }

  async closeSession(sessionId: string): Promise<void> {
    await Promise.all([
      this.cdpManager.closeConnection(sessionId),
      this.networkMonitor.stopMonitoring(sessionId),
      this.stateManager.clearSession(sessionId)
    ])
    
    const session = this.sessions.get(sessionId)
    if (session) {
      session.isActive = false
      this.sessions.delete(sessionId)
      this.emit('sessionClosed', sessionId)
    }
  }

  async closeAllSessions(): Promise<void> {
    await Promise.all([
      this.cdpManager.closeAllConnections(),
      this.networkMonitor.shutdown(),
      this.stateManager.clearAllSessions()
    ])
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
    networkMetrics: any
    jsExecutionStats: any
  } {
    return {
      totalSessions: this.sessions.size,
      activeSessions: this.getActiveSessions().length,
      totalOperations: this.operations.length,
      cdpStats: this.cdpManager.getConnectionStats(),
      securityPolicy: this.securityManager.getSecurityPolicy(),
      networkMetrics: this.networkMonitor.getNetworkMetrics(),
      jsExecutionStats: this.jsExecutor.getExecutionStats()
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

  // Console inspection methods
  async startConsoleInspection(sessionId: string, options: ConsoleInspectionOptions = {}): Promise<any> {
    try {
      const session = this.sessions.get(sessionId)
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`)
      }

      const result = await this.pageController.startConsoleInspection(sessionId, options)
      
      this.logOperation({
        type: 'inspect',
        sessionId,
        options,
        timestamp: new Date()
      })

      return result
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'BrowserManager',
          operation: 'startConsoleInspection',
          parameters: { sessionId, options }
        }
      )
      throw error
    }
  }

  async getConsoleLogs(
    sessionId: string,
    options: {
      level?: 'log' | 'info' | 'warn' | 'error' | 'debug'
      limit?: number
      clearAfter?: boolean
    } = {}
  ): Promise<any[]> {
    try {
      const session = this.sessions.get(sessionId)
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`)
      }

      return await this.pageController.getConsoleLogs(sessionId, options)
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'BrowserManager',
          operation: 'getConsoleLogs',
          parameters: { sessionId, options }
        }
      )
      throw error
    }
  }

  async clearConsoleLogs(sessionId: string): Promise<void> {
    try {
      const session = this.sessions.get(sessionId)
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`)
      }

      await this.pageController.clearConsoleLogs(sessionId)
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'BrowserManager',
          operation: 'clearConsoleLogs',
          parameters: { sessionId }
        }
      )
      throw error
    }
  }

  async stopConsoleInspection(sessionId: string): Promise<any> {
    try {
      const session = this.sessions.get(sessionId)
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`)
      }

      return await this.pageController.stopConsoleInspection(sessionId)
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'BrowserManager',
          operation: 'stopConsoleInspection',
          parameters: { sessionId }
        }
      )
      throw error
    }
  }

  async exportConsoleLogs(sessionId: string, options: ConsoleExportOptions): Promise<any> {
    try {
      const session = this.sessions.get(sessionId)
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`)
      }

      return await this.pageController.exportConsoleLogs(sessionId, options)
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'BrowserManager',
          operation: 'exportConsoleLogs',
          parameters: { sessionId, options }
        }
      )
      throw error
    }
  }

  async shutdown(): Promise<void> {
    await Promise.all([
      this.closeAllSessions(),
      this.cdpManager.shutdown(),
      this.securityManager.shutdown(),
      this.pageController.shutdown(),
      this.screenshotService.shutdown(),
      this.networkMonitor.shutdown(),
      this.jsExecutor.shutdown(),
      this.stateManager.shutdown()
    ])
    
    this.isInitialized = false
    this.emit('shutdown')
  }
} 