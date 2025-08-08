import { EventEmitter } from 'events'
import { getLogger } from '../../core/logger.js'
import { ErrorHandler } from '../../core/error-handler.js'
import { CDPConnectionManager } from './cdp-connection-manager.js'
import { DOMInspector } from './dom-inspector.js'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

export interface ScreenshotOptions {
  fullPage?: boolean
  quality?: number
  type?: 'png' | 'jpeg'
  path?: string
  clip?: {
    x: number
    y: number
    width: number
    height: number
  }
  omitBackground?: boolean
  encoding?: 'binary' | 'base64'
}

export interface ScreenshotResult {
  data: Buffer | string
  format: string
  size: number
  dimensions: {
    width: number
    height: number
  }
  path?: string
  timestamp: Date
}

export interface PDFOptions {
  path?: string
  format?: 'A4' | 'A3' | 'Letter' | 'Legal'
  landscape?: boolean
  printBackground?: boolean
  margin?: {
    top: string
    right: string
    bottom: string
    left: string
  }
  displayHeaderFooter?: boolean
  headerTemplate?: string
  footerTemplate?: string
  preferCSSPageSize?: boolean
}

export interface PDFResult {
  data: Buffer
  size: number
  path?: string
  pages: number
  timestamp: Date
}

export class ScreenshotService extends EventEmitter {
  private cdpManager: CDPConnectionManager
  private domInspector: DOMInspector
  private logger: any
  private errorHandler: ErrorHandler
  private outputDirectory: string
  private isInitialized: boolean = false

  constructor(cdpManager: CDPConnectionManager, outputDirectory: string = './screenshots') {
    super()
    this.cdpManager = cdpManager
    this.domInspector = new DOMInspector(cdpManager)
    this.logger = getLogger()
    this.errorHandler = new ErrorHandler()
    this.outputDirectory = outputDirectory
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      await this.errorHandler.initialize()
      await this.ensureOutputDirectory()
      this.isInitialized = true
      this.emit('initialized')
      
      this.logger.info('Screenshot Service initialized successfully', {
        module: 'ScreenshotService',
        operation: 'initialize',
        data: { outputDirectory: this.outputDirectory }
      })
    } catch (error) {
      this.logger.error('Failed to initialize Screenshot Service', {
        module: 'ScreenshotService',
        operation: 'initialize',
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Screenshot Service initialization failed: ${error}`)
    }
  }

  async captureScreenshot(sessionId: string, options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    if (!this.isInitialized) {
      throw new Error('Screenshot Service not initialized')
    }

    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      const screenshotOptions: any = {
        fullPage: options.fullPage || false,
        type: options.type || 'png',
        omitBackground: options.omitBackground || false,
        encoding: options.encoding || 'binary'
      }

      if ((screenshotOptions.type === 'jpeg' || screenshotOptions.type === 'webp') && typeof options.quality === 'number') {
        screenshotOptions.quality = options.quality
      }

      if (options.clip) {
        screenshotOptions.clip = options.clip
      }

      const startTime = Date.now()
      const screenshot = await connection.page.screenshot(screenshotOptions)
      const captureTime = Date.now() - startTime

      const result: ScreenshotResult = {
        data: screenshot,
        format: options.type || 'png',
        size: screenshot.length,
        dimensions: await this.getScreenshotDimensions(sessionId, options),
        timestamp: new Date()
      }

      if (options.path) {
        const filePath = await this.saveScreenshot(Buffer.from(screenshot), options.path, options.type || 'png')
        result.path = filePath
      }

      this.logger.info('Screenshot captured successfully', {
        module: 'ScreenshotService',
        operation: 'captureScreenshot',
        data: {
          sessionId,
          format: result.format,
          size: result.size,
          dimensions: result.dimensions,
          captureTime,
          path: result.path
        }
      })

      this.emit('screenshotCaptured', sessionId, result)
      return result
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'ScreenshotService',
          operation: 'captureScreenshot',
          sessionId,
          parameters: { options }
        },
        'medium'
      )
      throw error
    }
  }

  async captureElementScreenshot(sessionId: string, selector: string, options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    try {
      const element = await this.domInspector.querySelector(sessionId, selector)
      if (!element) {
        throw new Error(`Element not found: ${selector}`)
      }

      const boundingBox = await this.domInspector.getBoundingBox(sessionId, element.nodeId)
      if (!boundingBox) {
        throw new Error('Element has no bounding box')
      }

      const elementOptions: ScreenshotOptions = {
        ...options,
        clip: {
          x: boundingBox.x,
          y: boundingBox.y,
          width: boundingBox.width,
          height: boundingBox.height
        }
      }

      return await this.captureScreenshot(sessionId, elementOptions)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'ScreenshotService',
          operation: 'captureElementScreenshot',
          sessionId,
          parameters: { selector, options }
        },
        'medium'
      )
      throw error
    }
  }

  async generatePDF(sessionId: string, options: PDFOptions = {}): Promise<PDFResult> {
    if (!this.isInitialized) {
      throw new Error('Screenshot Service not initialized')
    }

    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      const pdfOptions: any = {
        format: options.format || 'A4',
        landscape: options.landscape || false,
        printBackground: options.printBackground || true,
        preferCSSPageSize: options.preferCSSPageSize || false
      }

      if (options.margin) {
        pdfOptions.margin = options.margin
      }

      if (options.displayHeaderFooter) {
        pdfOptions.displayHeaderFooter = options.displayHeaderFooter
        if (options.headerTemplate) {
          pdfOptions.headerTemplate = options.headerTemplate
        }
        if (options.footerTemplate) {
          pdfOptions.footerTemplate = options.footerTemplate
        }
      }

      const startTime = Date.now()
      const pdf = await connection.page.pdf(pdfOptions)
      const generationTime = Date.now() - startTime

      const result: PDFResult = {
        data: pdf,
        size: pdf.length,
        pages: await this.getPDFPageCount(pdf),
        timestamp: new Date()
      }

      if (options.path) {
        const filePath = await this.savePDF(pdf, options.path)
        result.path = filePath
      }

      this.logger.info('PDF generated successfully', {
        module: 'ScreenshotService',
        operation: 'generatePDF',
        data: {
          sessionId,
          size: result.size,
          pages: result.pages,
          generationTime,
          path: result.path
        }
      })

      this.emit('pdfGenerated', sessionId, result)
      return result
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'ScreenshotService',
          operation: 'generatePDF',
          sessionId,
          parameters: { options }
        },
        'medium'
      )
      throw error
    }
  }

  async captureVisualAnalysis(sessionId: string, selector?: string): Promise<{
    screenshot: ScreenshotResult
    analysis: {
      elementCount: number
      textContent: string
      colorScheme: string
      layout: string
    }
  }> {
    try {
      const screenshot = selector 
        ? await this.captureElementScreenshot(sessionId, selector)
        : await this.captureScreenshot(sessionId)

      const analysis = await this.analyzeVisualContent(sessionId, selector)
      
      this.logger.info('Visual analysis completed', {
        module: 'ScreenshotService',
        operation: 'captureVisualAnalysis',
        data: {
          sessionId,
          selector,
          analysis
        }
      })

      return { screenshot, analysis }
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'ScreenshotService',
          operation: 'captureVisualAnalysis',
          sessionId,
          parameters: { selector }
        },
        'medium'
      )
      throw error
    }
  }

  private async ensureOutputDirectory(): Promise<void> {
    try {
      if (!existsSync(this.outputDirectory)) {
        mkdirSync(this.outputDirectory, { recursive: true })
      }
    } catch (error) {
      this.logger.error('Failed to create output directory', {
        module: 'ScreenshotService',
        operation: 'ensureOutputDirectory',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { outputDirectory: this.outputDirectory }
      })
      throw error
    }
  }

  private async saveScreenshot(data: Buffer, filename: string, format: string): Promise<string> {
    try {
      const filePath = join(this.outputDirectory, filename)
      writeFileSync(filePath, data)
      
      this.logger.info('Screenshot saved to file', {
        module: 'ScreenshotService',
        operation: 'saveScreenshot',
        data: { filePath, size: data.length }
      })
      
      return filePath
    } catch (error) {
      this.logger.error('Failed to save screenshot', {
        module: 'ScreenshotService',
        operation: 'saveScreenshot',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { filename, format }
      })
      throw error
    }
  }

  private async savePDF(data: Buffer, filename: string): Promise<string> {
    try {
      const filePath = join(this.outputDirectory, filename)
      writeFileSync(filePath, data)
      
      this.logger.info('PDF saved to file', {
        module: 'ScreenshotService',
        operation: 'savePDF',
        data: { filePath, size: data.length }
      })
      
      return filePath
    } catch (error) {
      this.logger.error('Failed to save PDF', {
        module: 'ScreenshotService',
        operation: 'savePDF',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { filename }
      })
      throw error
    }
  }

  private async getScreenshotDimensions(sessionId: string, options: ScreenshotOptions): Promise<{ width: number; height: number }> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        return { width: 1920, height: 1080 }
      }

      if (options.clip) {
        return {
          width: options.clip.width,
          height: options.clip.height
        }
      }

      const viewport = await connection.page.viewport()
      if (viewport) {
        return {
          width: viewport.width,
          height: options.fullPage ? await this.getFullPageHeight(sessionId) : viewport.height
        }
      }

      return { width: 1920, height: 1080 }
    } catch (error) {
      this.logger.warn('Failed to get screenshot dimensions', {
        module: 'ScreenshotService',
        operation: 'getScreenshotDimensions',
        error: error instanceof Error ? error : new Error(String(error))
      })
      return { width: 1920, height: 1080 }
    }
  }

  private async getFullPageHeight(sessionId: string): Promise<number> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        return 1080
      }

      return await connection.page.evaluate(() => {
        return Math.max(
          (globalThis as any).document?.body?.scrollHeight || 0,
          (globalThis as any).document?.body?.offsetHeight || 0,
          (globalThis as any).document?.documentElement?.clientHeight || 0,
          (globalThis as any).document?.documentElement?.scrollHeight || 0,
          (globalThis as any).document?.documentElement?.offsetHeight || 0
        )
      })
    } catch (error) {
      this.logger.warn('Failed to get full page height', {
        module: 'ScreenshotService',
        operation: 'getFullPageHeight',
        error: error instanceof Error ? error : new Error(String(error))
      })
      return 1080
    }
  }

  private async getPDFPageCount(pdfBuffer: Buffer): Promise<number> {
    try {
      const pdfHeader = pdfBuffer.toString('ascii', 0, 1024)
      const pageCountMatch = pdfHeader.match(/\/Count\s+(\d+)/)
      return pageCountMatch ? parseInt(pageCountMatch[1] || '1') : 1
    } catch (error) {
      this.logger.warn('Failed to get PDF page count', {
        module: 'ScreenshotService',
        operation: 'getPDFPageCount',
        error: error instanceof Error ? error : new Error(String(error))
      })
      return 1
    }
  }

  private async analyzeVisualContent(sessionId: string, selector?: string): Promise<{
    elementCount: number
    textContent: string
    colorScheme: string
    layout: string
  }> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      const analysis = await connection.page.evaluate((selector) => {
        const target = selector ? (globalThis as any).document?.querySelector(selector) : (globalThis as any).document?.body
        if (!target) {
          return {
            elementCount: 0,
            textContent: '',
            colorScheme: 'unknown',
            layout: 'unknown'
          }
        }

        const elements = target.querySelectorAll('*')
        const textContent = target.textContent || ''
        const computedStyle = (globalThis as any).window?.getComputedStyle(target)
        const backgroundColor = computedStyle?.backgroundColor || ''
        const color = computedStyle?.color || ''

        let colorScheme = 'light'
        if (backgroundColor.includes('rgb(0, 0, 0)') || backgroundColor.includes('black')) {
          colorScheme = 'dark'
        }

        let layout = 'desktop'
        const viewport = (globalThis as any).window?.innerWidth || 1920
        if (viewport < 768) {
          layout = 'mobile'
        } else if (viewport < 1024) {
          layout = 'tablet'
        }

        return {
          elementCount: elements.length,
          textContent: textContent.substring(0, 500),
          colorScheme,
          layout
        }
      }, selector)

      return analysis
    } catch (error) {
      this.logger.warn('Failed to analyze visual content', {
        module: 'ScreenshotService',
        operation: 'analyzeVisualContent',
        error: error instanceof Error ? error : new Error(String(error))
      })
      return {
        elementCount: 0,
        textContent: '',
        colorScheme: 'unknown',
        layout: 'unknown'
      }
    }
  }

  getOutputDirectory(): string {
    return this.outputDirectory
  }

  setOutputDirectory(directory: string): void {
    this.outputDirectory = directory
    this.ensureOutputDirectory().catch(error => {
      this.logger.error('Failed to set output directory', {
        module: 'ScreenshotService',
        operation: 'setOutputDirectory',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { directory }
      })
    })
  }

  isReady(): boolean {
    return this.isInitialized
  }

  async shutdown(): Promise<void> {
    this.isInitialized = false
    this.emit('shutdown')
  }
}
