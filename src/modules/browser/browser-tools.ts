import { BrowserManager } from './browser-manager.js'
import { getLogger } from '../../core/logger.js'

export interface BrowserToolResult {
  success: boolean
  data?: any
  error?: string
  sessionId?: string
  timestamp: Date
}

export class BrowserTools {
  private browserManager: BrowserManager
  private logger: any
  private activeSessions: Set<string> = new Set()

  constructor(browserManager: BrowserManager) {
    this.browserManager = browserManager
    this.logger = getLogger()
  }

  async initialize(): Promise<void> {
    await this.browserManager.initialize()
    this.logger.info('Browser Tools initialized', {
      module: 'BrowserTools',
      operation: 'initialize'
    })
  }

  async createSession(sessionId: string, url?: string, options?: { headless?: boolean | "new" }): Promise<BrowserToolResult> {
    try {
      await this.browserManager.createSession(sessionId, url, options)
      this.activeSessions.add(sessionId)
      
      this.logger.info('Browser session created', {
        module: 'BrowserTools',
        operation: 'createSession',
        data: { sessionId, url }
      })

      return {
        success: true,
        data: { sessionId, url },
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to create browser session', {
        module: 'BrowserTools',
        operation: 'createSession',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, url }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async navigate(sessionId: string, url: string, options: any = {}): Promise<BrowserToolResult> {
    try {
      await this.browserManager.navigateToUrl(sessionId, url)
      
      this.logger.info('Browser navigation completed', {
        module: 'BrowserTools',
        operation: 'navigate',
        data: { sessionId, url }
      })

      return {
        success: true,
        data: { url },
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to navigate', {
        module: 'BrowserTools',
        operation: 'navigate',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, url }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async click(sessionId: string, selector: string, options: any = {}): Promise<BrowserToolResult> {
    try {
      await this.browserManager.clickElement(sessionId, selector, options)
      
      this.logger.info('Element clicked', {
        module: 'BrowserTools',
        operation: 'click',
        data: { sessionId, selector }
      })

      return {
        success: true,
        data: { selector },
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to click element', {
        module: 'BrowserTools',
        operation: 'click',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, selector }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async fill(sessionId: string, selector: string, value: string, options: any = {}): Promise<BrowserToolResult> {
    try {
      await this.browserManager.fillElement(sessionId, selector, value, options)
      
      this.logger.info('Element filled', {
        module: 'BrowserTools',
        operation: 'fill',
        data: { sessionId, selector, valueLength: value.length }
      })

      return {
        success: true,
        data: { selector, value },
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to fill element', {
        module: 'BrowserTools',
        operation: 'fill',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, selector }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async select(sessionId: string, selector: string, value: string, options: any = {}): Promise<BrowserToolResult> {
    try {
      await this.browserManager.selectOption(sessionId, selector, value, options)
      
      this.logger.info('Option selected', {
        module: 'BrowserTools',
        operation: 'select',
        data: { sessionId, selector, value }
      })

      return {
        success: true,
        data: { selector, value },
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to select option', {
        module: 'BrowserTools',
        operation: 'select',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, selector, value }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async scroll(sessionId: string, selector?: string, x?: number, y?: number): Promise<BrowserToolResult> {
    try {
      if (selector) {
        const script = `
          const element = document.querySelector('${selector}');
          if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
            return { scrolled: true, selector: '${selector}' };
          }
          return { scrolled: false, error: 'Element not found' };
        `
        const result = await this.browserManager.executeJavaScript(sessionId, script)
        
        this.logger.info('Element scrolled', {
          module: 'BrowserTools',
          operation: 'scroll',
          data: { sessionId, selector }
        })

        return {
          success: true,
          data: { selector, result },
          sessionId,
          timestamp: new Date()
        }
      } else {
        const scrollX = x || 0
        const scrollY = y || 0
        const script = `window.scrollTo(${scrollX}, ${scrollY}); ({ x: ${scrollX}, y: ${scrollY} })`
        const result = await this.browserManager.executeJavaScript(sessionId, script)
        
        this.logger.info('Page scrolled', {
          module: 'BrowserTools',
          operation: 'scroll',
          data: { sessionId, x: scrollX, y: scrollY }
        })

        return {
          success: true,
          data: { x: scrollX, y: scrollY, result },
          sessionId,
          timestamp: new Date()
        }
      }
    } catch (error) {
      this.logger.error('Failed to scroll', {
        module: 'BrowserTools',
        operation: 'scroll',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, selector, x, y }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async wait(sessionId: string, selector: string, options: any = {}): Promise<BrowserToolResult> {
    try {
      const element = await this.browserManager.waitForElement(sessionId, selector, options)
      
      this.logger.info('Element found', {
        module: 'BrowserTools',
        operation: 'wait',
        data: { sessionId, selector }
      })

      return {
        success: true,
        data: { selector, element },
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to wait for element', {
        module: 'BrowserTools',
        operation: 'wait',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, selector }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async back(sessionId: string): Promise<BrowserToolResult> {
    try {
      await this.browserManager.goBack(sessionId)
      
      this.logger.info('Navigated back', {
        module: 'BrowserTools',
        operation: 'back',
        data: { sessionId }
      })

      return {
        success: true,
        data: { action: 'back' },
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to navigate back', {
        module: 'BrowserTools',
        operation: 'back',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async forward(sessionId: string): Promise<BrowserToolResult> {
    try {
      await this.browserManager.goForward(sessionId)
      
      this.logger.info('Navigated forward', {
        module: 'BrowserTools',
        operation: 'forward',
        data: { sessionId }
      })

      return {
        success: true,
        data: { action: 'forward' },
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to navigate forward', {
        module: 'BrowserTools',
        operation: 'forward',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async refresh(sessionId: string): Promise<BrowserToolResult> {
    try {
      await this.browserManager.refresh(sessionId)
      
      this.logger.info('Page refreshed', {
        module: 'BrowserTools',
        operation: 'refresh',
        data: { sessionId }
      })

      return {
        success: true,
        data: { action: 'refresh' },
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to refresh page', {
        module: 'BrowserTools',
        operation: 'refresh',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async screenshot(sessionId: string, options: any = {}): Promise<BrowserToolResult> {
    try {
      const result = await this.browserManager.takeScreenshot(sessionId, options)
      
      this.logger.info('Screenshot captured', {
        module: 'BrowserTools',
        operation: 'screenshot',
        data: { sessionId, format: result.format, size: result.size }
      })

      return {
        success: true,
        data: result,
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to capture screenshot', {
        module: 'BrowserTools',
        operation: 'screenshot',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async intelligentScreenshot(sessionId: string, description?: string, options: any = {}): Promise<BrowserToolResult> {
    try {
      const result = await this.browserManager.takeIntelligentScreenshot(sessionId, description, options)
      
      this.logger.info('Intelligent screenshot captured', {
        module: 'BrowserTools',
        operation: 'intelligentScreenshot',
        data: { 
          sessionId, 
          description, 
          confidence: result.confidence,
          region: result.analysis.region,
          format: result.format, 
          size: result.size 
        }
      })

      return {
        success: true,
        data: result,
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to capture intelligent screenshot', {
        module: 'BrowserTools',
        operation: 'intelligentScreenshot',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, description }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async captureContentArea(sessionId: string, options: any = {}): Promise<BrowserToolResult> {
    try {
      const result = await this.browserManager.captureContentArea(sessionId, options)
      
      this.logger.info('Content area screenshot captured', {
        module: 'BrowserTools',
        operation: 'captureContentArea',
        data: { 
          sessionId, 
          confidence: result.confidence,
          region: result.analysis.region,
          format: result.format, 
          size: result.size 
        }
      })

      return {
        success: true,
        data: result,
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to capture content area screenshot', {
        module: 'BrowserTools',
        operation: 'captureContentArea',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async captureInteractiveElements(sessionId: string, options: any = {}): Promise<BrowserToolResult> {
    try {
      const result = await this.browserManager.captureInteractiveElements(sessionId, options)
      
      this.logger.info('Interactive elements screenshot captured', {
        module: 'BrowserTools',
        operation: 'captureInteractiveElements',
        data: { 
          sessionId, 
          confidence: result.confidence,
          region: result.analysis.region,
          format: result.format, 
          size: result.size 
        }
      })

      return {
        success: true,
        data: result,
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to capture interactive elements screenshot', {
        module: 'BrowserTools',
        operation: 'captureInteractiveElements',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async captureErrorStates(sessionId: string, options: any = {}): Promise<BrowserToolResult> {
    try {
      const result = await this.browserManager.captureErrorStates(sessionId, options)
      
      this.logger.info('Error states screenshot captured', {
        module: 'BrowserTools',
        operation: 'captureErrorStates',
        data: { 
          sessionId, 
          confidence: result.confidence,
          region: result.analysis.region,
          format: result.format, 
          size: result.size 
        }
      })

      return {
        success: true,
        data: result,
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to capture error states screenshot', {
        module: 'BrowserTools',
        operation: 'captureErrorStates',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async captureSemanticRegion(sessionId: string, region: string, options: any = {}): Promise<BrowserToolResult> {
    try {
      const result = await this.browserManager.captureSemanticRegion(sessionId, region, options)
      
      this.logger.info('Semantic region screenshot captured', {
        module: 'BrowserTools',
        operation: 'captureSemanticRegion',
        data: { 
          sessionId, 
          region,
          confidence: result.confidence,
          format: result.format, 
          size: result.size 
        }
      })

      return {
        success: true,
        data: result,
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to capture semantic region screenshot', {
        module: 'BrowserTools',
        operation: 'captureSemanticRegion',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, region }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async extract(sessionId: string, selector: string, options: any = {}): Promise<BrowserToolResult> {
    try {
      const element = await this.browserManager.getElementInfo(sessionId, selector)
      
      this.logger.info('Content extracted', {
        module: 'BrowserTools',
        operation: 'extract',
        data: { sessionId, selector }
      })

      return {
        success: true,
        data: { selector, element },
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to extract content', {
        module: 'BrowserTools',
        operation: 'extract',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, selector }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async execute(sessionId: string, script: string, options: any = {}): Promise<BrowserToolResult> {
    try {
      // Validate session state before execution
      const isSessionValid = await this.validateSessionState(sessionId)
      if (!isSessionValid) {
        return {
          success: false,
          error: 'Session state is invalid or connection is unhealthy',
          sessionId,
          timestamp: new Date()
        }
      }

      const result = await this.browserManager.executeJavaScript(sessionId, script, options)
      
      this.logger.info('Script executed successfully', {
        module: 'BrowserTools',
        operation: 'execute',
        data: { sessionId, scriptLength: script.length, hasResult: !!result }
      })

      return {
        success: true,
        data: { result },
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to execute script', {
        module: 'BrowserTools',
        operation: 'execute',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, scriptLength: script.length }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  // AI-powered wrappers
  async findElementAI(sessionId: string, description: string, context?: any): Promise<BrowserToolResult> {
    try {
      const match = await this.browserManager.findElementByDescription(sessionId, description, context)
      this.logger.info('AI element found', { module: 'BrowserTools', operation: 'findElementAI', data: { sessionId } })
      return { success: true, data: match, sessionId, timestamp: new Date() }
    } catch (error) {
      this.logger.error('Failed to find element AI', { module: 'BrowserTools', operation: 'findElementAI', error: error instanceof Error ? error : new Error(String(error)) })
      return { success: false, error: error instanceof Error ? error.message : String(error), sessionId, timestamp: new Date() }
    }
  }

  async generateSelectorsAI(sessionId: string, elementSelector: string): Promise<BrowserToolResult> {
    try {
      const strategies = await this.browserManager.generateRobustSelectors(sessionId, elementSelector)
      this.logger.info('AI selectors generated', { module: 'BrowserTools', operation: 'generateSelectorsAI', data: { sessionId } })
      return { success: true, data: { strategies }, sessionId, timestamp: new Date() }
    } catch (error) {
      this.logger.error('Failed to generate AI selectors', { module: 'BrowserTools', operation: 'generateSelectorsAI', error: error instanceof Error ? error : new Error(String(error)) })
      return { success: false, error: error instanceof Error ? error.message : String(error), sessionId, timestamp: new Date() }
    }
  }

  async analyzeSemanticsAI(sessionId: string): Promise<BrowserToolResult> {
    try {
      const map = await this.browserManager.analyzePageSemanticsAI(sessionId)
      this.logger.info('AI semantics analyzed', { module: 'BrowserTools', operation: 'analyzeSemanticsAI', data: { sessionId } })
      return { success: true, data: map, sessionId, timestamp: new Date() }
    } catch (error) {
      this.logger.error('Failed to analyze AI semantics', { module: 'BrowserTools', operation: 'analyzeSemanticsAI', error: error instanceof Error ? error : new Error(String(error)) })
      return { success: false, error: error instanceof Error ? error.message : String(error), sessionId, timestamp: new Date() }
    }
  }

  async getHTML(sessionId: string): Promise<BrowserToolResult> {
    try {
      const res = await this.browserManager.executeJavaScript(sessionId, 'document.documentElement.outerHTML')
      const html = res?.result
      
      this.logger.info('HTML content retrieved', {
        module: 'BrowserTools',
        operation: 'getHTML',
        data: { sessionId, htmlLength: (html?.length || 0) }
      })

      return {
        success: true,
        data: { html },
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to get HTML', {
        module: 'BrowserTools',
        operation: 'getHTML',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async getText(sessionId: string, selector?: string): Promise<BrowserToolResult> {
    try {
      const script = selector 
        ? `document.querySelector('${selector}')?.textContent || ''`
        : 'document.body.textContent || ""'
      
      const res = await this.browserManager.executeJavaScript(sessionId, script)
      const text = res?.result || ''
      
      this.logger.info('Text content retrieved', {
        module: 'BrowserTools',
        operation: 'getText',
        data: { sessionId, selector, textLength: (text?.length || 0) }
      })

      return {
        success: true,
        data: { text, selector },
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to get text', {
        module: 'BrowserTools',
        operation: 'getText',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, selector }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async network(sessionId: string, action: string): Promise<BrowserToolResult> {
    try {
      // Validate session state before network operations
      const isSessionValid = await this.validateSessionState(sessionId)
      if (!isSessionValid) {
        return {
          success: false,
          error: 'Session state is invalid or connection is unhealthy',
          sessionId,
          timestamp: new Date()
        }
      }

      let result: any
      
      switch (action) {
        case 'start':
          await this.browserManager.networkMonitorPublic.startMonitoring(sessionId)
          result = { message: 'Network monitoring started successfully' }
          break
        case 'stop':
          await this.browserManager.networkMonitorPublic.stopMonitoring(sessionId)
          result = { message: 'Network monitoring stopped successfully' }
          break
        case 'get':
          result = await this.browserManager.networkMonitorPublic.getNetworkMetrics()
          break
        default:
          throw new Error(`Unknown network action: ${action}`)
      }
      
      this.logger.info('Network operation completed successfully', {
        module: 'BrowserTools',
        operation: 'network',
        data: { sessionId, action }
      })

      return {
        success: true,
        data: { action, result },
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to perform network operation', {
        module: 'BrowserTools',
        operation: 'network',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, action }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async state(sessionId: string, action: string, key?: string, value?: string, domain?: string): Promise<BrowserToolResult> {
    try {
      // Validate session state before state operations
      const isSessionValid = await this.validateSessionState(sessionId)
      if (!isSessionValid) {
        return {
          success: false,
          error: 'Session state is invalid or connection is unhealthy',
          sessionId,
          timestamp: new Date()
        }
      }

      let result: any
      
      switch (action) {
        case 'getCookies':
          result = await this.browserManager.stateManagerPublic.getCookies(sessionId, domain)
          break
        case 'setCookie':
          if (!key || !value) {
            throw new Error('Cookie name and value are required')
          }
          const cookieData: any = { name: key, value }
          if (domain) {
            cookieData.domain = domain
          }
          await this.browserManager.stateManagerPublic.setCookie(sessionId, cookieData)
          result = { message: 'Cookie set successfully' }
          break
        case 'deleteCookie':
          if (!key) {
            throw new Error('Cookie name is required')
          }
          await this.browserManager.stateManagerPublic.deleteCookie(sessionId, key, domain)
          result = { message: 'Cookie deleted successfully' }
          break
        case 'getLocalStorage':
          result = await this.browserManager.stateManagerPublic.getLocalStorage(sessionId)
          break
        case 'setLocalStorageItem':
          if (!key || !value) {
            throw new Error('Key and value are required')
          }
          await this.browserManager.stateManagerPublic.setLocalStorageItem(sessionId, key, value)
          result = { message: 'Local storage item set successfully' }
          break
        case 'getSessionStorage':
          result = await this.browserManager.stateManagerPublic.getSessionStorage(sessionId)
          break
        case 'setSessionStorageItem':
          if (!key || !value) {
            throw new Error('Key and value are required')
          }
          await this.browserManager.stateManagerPublic.setSessionStorageItem(sessionId, key, value)
          result = { message: 'Session storage item set successfully' }
          break
        default:
          throw new Error(`Unknown state action: ${action}`)
      }
      
      this.logger.info('State operation completed successfully', {
        module: 'BrowserTools',
        operation: 'state',
        data: { sessionId, action, key }
      })

      return {
        success: true,
        data: { action, result },
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to perform state operation', {
        module: 'BrowserTools',
        operation: 'state',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, action, key }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  async closeSession(sessionId: string): Promise<BrowserToolResult> {
    try {
      await this.browserManager.closeSession(sessionId)
      this.activeSessions.delete(sessionId)
      
      this.logger.info('Browser session closed', {
        module: 'BrowserTools',
        operation: 'closeSession',
        data: { sessionId }
      })

      return {
        success: true,
        data: { sessionId },
        sessionId,
        timestamp: new Date()
      }
    } catch (error) {
      this.logger.error('Failed to close session', {
        module: 'BrowserTools',
        operation: 'closeSession',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId }
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        timestamp: new Date()
      }
    }
  }

  getActiveSessions(): string[] {
    return Array.from(this.activeSessions)
  }

  getBrowserStats(): any {
    return this.browserManager.getBrowserStats()
  }

  isReady(): boolean {
    return this.browserManager.isReady()
  }

  async shutdown(): Promise<void> {
    for (const sessionId of this.activeSessions) {
      await this.closeSession(sessionId)
    }
    await this.browserManager.shutdown()
  }

  private async validateSessionState(sessionId: string): Promise<boolean> {
    try {
      // Check if session exists in active sessions
      if (!this.activeSessions.has(sessionId)) {
        this.logger.warn('Session validation failed - session not in active sessions', {
          module: 'BrowserTools',
          operation: 'validateSessionState',
          sessionId
        })
        return false
      }

      // Validate connection health
      const isConnectionValid = await this.browserManager.cdpManagerPublic.validateConnection(sessionId)
      if (!isConnectionValid) {
        this.logger.warn('Session validation failed - connection is unhealthy', {
          module: 'BrowserTools',
          operation: 'validateSessionState',
          sessionId
        })
        return false
      }

      // Get connection health status
      const connectionHealth = this.browserManager.cdpManagerPublic.getConnectionHealth(sessionId)
      if (!connectionHealth || !connectionHealth.isHealthy) {
        this.logger.warn('Session validation failed - connection health is poor', {
          module: 'BrowserTools',
          operation: 'validateSessionState',
          sessionId,
          health: connectionHealth
        })
        return false
      }

      return true
    } catch (error) {
      this.logger.error('Session validation error', {
        module: 'BrowserTools',
        operation: 'validateSessionState',
        sessionId,
        error: error instanceof Error ? error : new Error(String(error))
      })
      return false
    }
  }
}
