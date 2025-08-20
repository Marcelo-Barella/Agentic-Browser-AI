import { EventEmitter } from 'events'
import { getLogger } from '../../core/logger.js'
import { ErrorHandler } from '../../core/error-handler.js'
import { CDPConnectionManager } from './cdp-connection-manager.js'
import { DOMInspector } from './dom-inspector.js'

export interface PageState {
  url: string
  title: string
  isLoaded: boolean
  isLoading: boolean
  loadTime: number
  errorCount: number
  lastActivity: Date
  viewport: {
    width: number
    height: number
  }
  history: {
    current: number
    entries: string[]
  }
}

export interface NavigationOptions {
  timeout?: number
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'
  referrer?: string
}

export interface ElementInteractionOptions {
  timeout?: number
  waitForVisible?: boolean
  waitForEnabled?: boolean
  scrollIntoView?: boolean
}

export interface ViewportOptions {
  width: number
  height: number
  deviceScaleFactor?: number
  isMobile?: boolean
  hasTouch?: boolean
  isLandscape?: boolean
}

export class PageController extends EventEmitter {
  private cdpManager: CDPConnectionManager
  private domInspector: DOMInspector
  private logger: any
  private errorHandler: ErrorHandler
  private pageStates: Map<string, PageState> = new Map()
  private isInitialized: boolean = false

  constructor(cdpManager: CDPConnectionManager) {
    super()
    this.cdpManager = cdpManager
    this.domInspector = new DOMInspector(cdpManager)
    this.logger = getLogger()
    this.errorHandler = new ErrorHandler()
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      await this.errorHandler.initialize()
      this.isInitialized = true
      this.emit('initialized')
      
      this.logger.info('Page Controller initialized successfully', {
        module: 'PageController',
        operation: 'initialize'
      })
    } catch (error) {
      this.logger.error('Failed to initialize Page Controller', {
        module: 'PageController',
        operation: 'initialize',
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Page Controller initialization failed: ${error}`)
    }
  }

  async createPage(sessionId: string, url?: string): Promise<PageState> {
    if (!this.isInitialized) {
      throw new Error('Page Controller not initialized')
    }

    try {
      console.log(`🔧 [PAGE] Creating page for session: ${sessionId}`)
      
      const connection = await this.cdpManager.createConnection(sessionId)
      console.log(`✅ [PAGE] CDP connection created for session: ${sessionId}`)
      
      const pageState: PageState = {
        url: url || '',
        title: '',
        isLoaded: false,
        isLoading: false,
        loadTime: 0,
        errorCount: 0,
        lastActivity: new Date(),
        viewport: {
          width: 1920,
          height: 1080
        },
        history: {
          current: 0,
          entries: []
        }
      }

      this.pageStates.set(sessionId, pageState)
      console.log(`✅ [PAGE] Page state created and stored for session: ${sessionId}`)
      
      this.emit('pageCreated', sessionId, pageState)

      if (url) {
        console.log(`🔧 [PAGE] Navigating to URL: ${url} for session: ${sessionId}`)
        await this.navigateToUrl(sessionId, url)
      }

      console.log(`✅ [PAGE] Page creation completed for session: ${sessionId}`)
      return pageState
    } catch (error) {
      console.error(`❌ [PAGE] Failed to create page for session: ${sessionId}`, error)
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'PageController',
          operation: 'createPage',
          sessionId
        },
        'high'
      )
      throw error
    }
  }

  async navigateToUrl(sessionId: string, url: string, options: NavigationOptions = {}): Promise<void> {
    const pageState = this.pageStates.get(sessionId)
    if (!pageState) {
      throw new Error('Page state not found')
    }

    try {
      pageState.isLoading = true
      pageState.lastActivity = new Date()
      
      const startTime = Date.now()
      
      await this.cdpManager.navigateToUrl(sessionId, url)
      
      const loadTime = Date.now() - startTime
      
      const pageInfo = await this.cdpManager.getPageInfo(sessionId)
      
      pageState.url = url
      pageState.title = pageInfo.title
      pageState.isLoaded = true
      pageState.isLoading = false
      pageState.loadTime = loadTime
      pageState.viewport = { width: 1920, height: 1080 } // Default viewport since getPageInfo doesn't return viewport
      
      this.addToHistory(sessionId, url)
      
      this.logger.info('Page navigation completed', {
        module: 'PageController',
        operation: 'navigateToUrl',
        data: {
          sessionId,
          url,
          loadTime,
          title: pageInfo.title
        }
      })
      
      this.emit('navigated', sessionId, url, pageState)
    } catch (error) {
      pageState.isLoading = false
      pageState.errorCount++
      
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'PageController',
          operation: 'navigateToUrl',
          sessionId,
          parameters: { url, options }
        },
        'medium'
      )
      throw error
    }
  }

  async waitForElement(sessionId: string, selector: string, options: ElementInteractionOptions = {}): Promise<any> {
    const timeout = options.timeout || 10000
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeout) {
      try {
        const element = await this.domInspector.querySelector(sessionId, selector)
        if (element) {
          if (options.waitForVisible && !element.isVisible) {
            await new Promise(resolve => setTimeout(resolve, 100))
            continue
          }
          
          if (options.waitForEnabled) {
            const isEnabled = await this.isElementEnabled(sessionId, element.nodeId)
            if (!isEnabled) {
              await new Promise(resolve => setTimeout(resolve, 100))
              continue
            }
          }
          
          if (options.scrollIntoView) {
            await this.scrollElementIntoView(sessionId, element.nodeId)
          }
          
          return element
        }
        
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    throw new Error(`Element ${selector} not found within timeout`)
  }

  async clickElement(sessionId: string, selector: string, options: ElementInteractionOptions = {}): Promise<void> {
    const element = await this.waitForElement(sessionId, selector, options)
    
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }
      
      await connection.page.click(selector, {
        delay: 0
      })
      
      this.logger.info('Element clicked successfully', {
        module: 'PageController',
        operation: 'clickElement',
        data: { sessionId, selector }
      })
      
      this.emit('elementClicked', sessionId, selector)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'PageController',
          operation: 'clickElement',
          sessionId,
          parameters: { selector, options }
        },
        'medium'
      )
      throw error
    }
  }

  async fillElement(sessionId: string, selector: string, value: string, options: ElementInteractionOptions = {}): Promise<void> {
    const element = await this.waitForElement(sessionId, selector, options)
    
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }
      
      await connection.page.type(selector, value, {
        delay: 0
      })
      
      this.logger.info('Element filled successfully', {
        module: 'PageController',
        operation: 'fillElement',
        data: { sessionId, selector, valueLength: value.length }
      })
      
      this.emit('elementFilled', sessionId, selector, value)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'PageController',
          operation: 'fillElement',
          sessionId,
          parameters: { selector, value, options }
        },
        'medium'
      )
      throw error
    }
  }

  async selectOption(sessionId: string, selector: string, value: string, options: ElementInteractionOptions = {}): Promise<void> {
    const element = await this.waitForElement(sessionId, selector, options)
    
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }
      
      await connection.page.select(selector, value)
      
      this.logger.info('Option selected successfully', {
        module: 'PageController',
        operation: 'selectOption',
        data: { sessionId, selector, value }
      })
      
      this.emit('optionSelected', sessionId, selector, value)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'PageController',
          operation: 'selectOption',
          sessionId,
          parameters: { selector, value, options }
        },
        'medium'
      )
      throw error
    }
  }

  async scrollTo(sessionId: string, x: number, y: number): Promise<void> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }
      
      await connection.page.evaluate((x, y) => {
        (globalThis as any).scrollTo(x, y)
      }, x, y)
      
      this.logger.info('Page scrolled successfully', {
        module: 'PageController',
        operation: 'scrollTo',
        data: { sessionId, x, y }
      })
      
      this.emit('pageScrolled', sessionId, x, y)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'PageController',
          operation: 'scrollTo',
          sessionId,
          parameters: { x, y }
        },
        'low'
      )
      throw error
    }
  }

  async setViewport(sessionId: string, options: ViewportOptions): Promise<void> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }
      
      await connection.page.setViewport({
        width: options.width,
        height: options.height,
        deviceScaleFactor: options.deviceScaleFactor || 1,
        isMobile: options.isMobile || false,
        hasTouch: options.hasTouch || false,
        isLandscape: options.isLandscape || false
      })
      
      const pageState = this.pageStates.get(sessionId)
      if (pageState) {
        pageState.viewport = {
          width: options.width,
          height: options.height
        }
      }
      
      this.logger.info('Viewport set successfully', {
        module: 'PageController',
        operation: 'setViewport',
        data: { sessionId, options }
      })
      
      this.emit('viewportChanged', sessionId, options)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'PageController',
          operation: 'setViewport',
          sessionId,
          parameters: { options }
        },
        'low'
      )
      throw error
    }
  }

  async goBack(sessionId: string): Promise<void> {
    const pageState = this.pageStates.get(sessionId)
    if (!pageState) {
      throw new Error('Page state not found')
    }
    
    if (pageState.history.current <= 0) {
      throw new Error('No history to go back')
    }
    
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }
      
      await connection.page.goBack()
      
      pageState.history.current--
      const previousUrl = pageState.history.entries[pageState.history.current]
      
      const pageInfo = await this.cdpManager.getPageInfo(sessionId)
      pageState.url = previousUrl || ''
      pageState.title = pageInfo.title
      pageState.lastActivity = new Date()
      
      this.logger.info('Navigated back successfully', {
        module: 'PageController',
        operation: 'goBack',
        data: { sessionId, url: previousUrl }
      })
      
      this.emit('navigatedBack', sessionId, previousUrl)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'PageController',
          operation: 'goBack',
          sessionId
        },
        'medium'
      )
      throw error
    }
  }

  async goForward(sessionId: string): Promise<void> {
    const pageState = this.pageStates.get(sessionId)
    if (!pageState) {
      throw new Error('Page state not found')
    }
    
    if (pageState.history.current >= pageState.history.entries.length - 1) {
      throw new Error('No history to go forward')
    }
    
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }
      
      await connection.page.goForward()
      
      pageState.history.current++
      const nextUrl = pageState.history.entries[pageState.history.current]
      
      const pageInfo = await this.cdpManager.getPageInfo(sessionId)
      pageState.url = nextUrl || ''
      pageState.title = pageInfo.title
      pageState.lastActivity = new Date()
      
      this.logger.info('Navigated forward successfully', {
        module: 'PageController',
        operation: 'goForward',
        data: { sessionId, url: nextUrl }
      })
      
      this.emit('navigatedForward', sessionId, nextUrl)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'PageController',
          operation: 'goForward',
          sessionId
        },
        'medium'
      )
      throw error
    }
  }

  async refresh(sessionId: string): Promise<void> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }
      
      await connection.page.reload()
      
      const pageState = this.pageStates.get(sessionId)
      if (pageState) {
        pageState.lastActivity = new Date()
      }
      
      this.logger.info('Page refreshed successfully', {
        module: 'PageController',
        operation: 'refresh',
        data: { sessionId }
      })
      
      this.emit('pageRefreshed', sessionId)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'PageController',
          operation: 'refresh',
          sessionId
        },
        'medium'
      )
      throw error
    }
  }

  getPageState(sessionId: string): PageState | undefined {
    return this.pageStates.get(sessionId)
  }

  getAllPageStates(): PageState[] {
    return Array.from(this.pageStates.values())
  }

  private addToHistory(sessionId: string, url: string): void {
    const pageState = this.pageStates.get(sessionId)
    if (!pageState) {
      return
    }
    
    const currentIndex = pageState.history.current
    const entries = pageState.history.entries
    
    if (currentIndex < entries.length - 1) {
      entries.splice(currentIndex + 1)
    }
    
    entries.push(url)
    pageState.history.current = entries.length - 1
  }

  private async isElementEnabled(sessionId: string, nodeId: number): Promise<boolean> {
    try {
      const element = await this.domInspector.getNodeById(sessionId, nodeId)
      if (!element) {
        return false
      }
      
      const disabledAttr = element.attributes.find(attr => attr.name === 'disabled')
      return !disabledAttr || disabledAttr.value !== 'true'
    } catch {
      return false
    }
  }

  private async scrollElementIntoView(sessionId: string, nodeId: number): Promise<void> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }
      
      await connection.page.evaluate((nodeId) => {
        const element = (globalThis as any).document?.querySelector(`[data-node-id="${nodeId}"]`)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, nodeId)
    } catch (error) {
      this.logger.warn('Failed to scroll element into view', {
        module: 'PageController',
        operation: 'scrollElementIntoView',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, nodeId }
      })
    }
  }

  isReady(): boolean {
    return this.isInitialized
  }

  async shutdown(): Promise<void> {
    this.pageStates.clear()
    this.isInitialized = false
    this.emit('shutdown')
  }
}
