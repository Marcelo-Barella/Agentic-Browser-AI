import { EventEmitter } from 'events'
import { getLogger } from '../../core/logger.js'
import { ErrorHandler } from '../../core/error-handler.js'
import { CDPConnectionManager } from './cdp-connection-manager.js'
import { DOMInspector } from './dom-inspector.js'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import sharp from 'sharp'

export interface ScreenshotOptions {
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
  maxWidth?: number
  maxHeight?: number
  maxFileSize?: number // Maximum file size in bytes
  compress?: boolean
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

      // Ensure screenshot is a Buffer
      const screenshotBuffer = typeof screenshot === 'string' ? Buffer.from(screenshot, 'base64') : screenshot

      // Process the screenshot with compression and resizing
      const processedScreenshot = await this.processScreenshot(screenshotBuffer, options)

      const result: ScreenshotResult = {
        data: processedScreenshot,
        format: options.type || 'png',
        size: processedScreenshot.length,
        dimensions: await this.getScreenshotDimensions(sessionId, options),
        timestamp: new Date()
      }

      if (options.path) {
        const filePath = await this.saveScreenshot(processedScreenshot, options.path, options.type || 'png')
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

  private async processScreenshot(screenshot: Buffer, options: ScreenshotOptions): Promise<Buffer> {
    try {
      let processedImage = sharp(screenshot)

      // Set aggressive default settings for AI processing
      const defaultMaxWidth = options.maxWidth || 800
      const defaultMaxHeight = options.maxHeight || 600
      const defaultQuality = options.quality || 60
      const defaultMaxFileSize = options.maxFileSize || 50 * 1024 // 50KB default

      // Always resize to reasonable dimensions for AI processing
      const resizeOptions = {
        width: defaultMaxWidth,
        height: defaultMaxHeight,
        fit: 'inside' as const,
        withoutEnlargement: true
      }
      processedImage = processedImage.resize(resizeOptions)

      // Apply aggressive compression (default to JPEG for better compression)
      if (options.compress !== false) {
        const format = options.type || 'jpeg'
        const quality = defaultQuality

        if (format === 'jpeg') {
          processedImage = processedImage.jpeg({ quality })
        } else if (format === 'png') {
          // Convert PNG to JPEG for better compression
          processedImage = processedImage.jpeg({ quality })
        }
      }

      // Apply progressive quality reduction if maxFileSize is specified
      if (options.maxFileSize) {
        let result = await processedImage.toBuffer()
        let currentQuality = defaultQuality

        while (result.length > options.maxFileSize && currentQuality > 10) {
          currentQuality -= 10
          const format = options.type || 'jpeg'
          
          if (format === 'jpeg' || (format === 'png' && currentQuality < 100)) {
            result = await sharp(screenshot)
              .resize(defaultMaxWidth, defaultMaxHeight, { fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: currentQuality })
              .toBuffer()
          } else {
            break
          }
        }

        return result
      }

      return await processedImage.toBuffer()
    } catch (error) {
      this.logger.warn('Failed to process screenshot, returning original', {
        module: 'ScreenshotService',
        operation: 'processScreenshot',
        error: error instanceof Error ? error : new Error(String(error))
      })
      return screenshot
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
      // Ensure filename has proper extension
      let filePath = join(this.outputDirectory, filename)
      if (!filename.includes('.')) {
        const extension = format === 'jpeg' ? '.jpg' : '.png'
        filePath = join(this.outputDirectory, `${filename}${extension}`)
      }

      // Ensure data is a proper Buffer
      const bufferData = Buffer.isBuffer(data) ? data : Buffer.from(data)
      
      // Write file synchronously to ensure it's complete
      writeFileSync(filePath, bufferData)
      
      this.logger.info('Screenshot saved to file', {
        module: 'ScreenshotService',
        operation: 'saveScreenshot',
        data: { filePath, size: bufferData.length, format }
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
          height: viewport.height
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

  // Intelligent Screenshot Methods
  async captureIntelligentScreenshot(sessionId: string, description?: string, options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    if (!this.isInitialized) {
      throw new Error('Screenshot Service not initialized')
    }

    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      // Analyze page content to determine the best capture strategy
      const pageAnalysis = await this.analyzePageContent(sessionId, description)
      
      // Apply intelligent options based on analysis
      const intelligentOptions: ScreenshotOptions = {
        ...options,
        ...(pageAnalysis.targetRegion && { clip: pageAnalysis.targetRegion })
      }

      this.logger.info('Intelligent screenshot analysis completed', {
        module: 'ScreenshotService',
        operation: 'captureIntelligentScreenshot',
        data: {
          sessionId,
          description,
          analysis: pageAnalysis,
          options: intelligentOptions
        }
      })

      return await this.captureScreenshot(sessionId, intelligentOptions)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'ScreenshotService',
          operation: 'captureIntelligentScreenshot',
          sessionId,
          parameters: { description, options }
        },
        'medium'
      )
      throw error
    }
  }

  async captureContentArea(sessionId: string, options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    if (!this.isInitialized) {
      throw new Error('Screenshot Service not initialized')
    }

    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      // Find the main content area
      const contentArea = await this.findMainContentArea(sessionId)
      
      const contentOptions: ScreenshotOptions = {
        ...options,
        ...(contentArea && { clip: contentArea })
      }

      this.logger.info('Content area identified', {
        module: 'ScreenshotService',
        operation: 'captureContentArea',
        data: {
          sessionId,
          contentArea,
          options: contentOptions
        }
      })

      return await this.captureScreenshot(sessionId, contentOptions)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'ScreenshotService',
          operation: 'captureContentArea',
          sessionId,
          parameters: { options }
        },
        'medium'
      )
      throw error
    }
  }

  async captureInteractiveElements(sessionId: string, options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    if (!this.isInitialized) {
      throw new Error('Screenshot Service not initialized')
    }

    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      // Find interactive elements
      const interactiveElements = await this.findInteractiveElements(sessionId)
      
      if (interactiveElements.length === 0) {
        this.logger.warn('No interactive elements found', {
          module: 'ScreenshotService',
          operation: 'captureInteractiveElements',
          data: { sessionId }
        })
        return await this.captureScreenshot(sessionId, options)
      }

      // Capture the area containing interactive elements
      const interactiveArea = this.calculateBoundingBox(interactiveElements)
      
      const interactiveOptions: ScreenshotOptions = {
        ...options,
        clip: interactiveArea
      }

      this.logger.info('Interactive elements captured', {
        module: 'ScreenshotService',
        operation: 'captureInteractiveElements',
        data: {
          sessionId,
          elementCount: interactiveElements.length,
          interactiveArea,
          options: interactiveOptions
        }
      })

      return await this.captureScreenshot(sessionId, interactiveOptions)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'ScreenshotService',
          operation: 'captureInteractiveElements',
          sessionId,
          parameters: { options }
        },
        'medium'
      )
      throw error
    }
  }

  async captureErrorStates(sessionId: string, options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    if (!this.isInitialized) {
      throw new Error('Screenshot Service not initialized')
    }

    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      // Find error states and elements
      const errorElements = await this.findErrorStates(sessionId)
      
      if (errorElements.length === 0) {
        this.logger.info('No error states found', {
          module: 'ScreenshotService',
          operation: 'captureErrorStates',
          data: { sessionId }
        })
        return await this.captureScreenshot(sessionId, options)
      }

      // Capture the area containing error states
      const errorArea = this.calculateBoundingBox(errorElements)
      
      const errorOptions: ScreenshotOptions = {
        ...options,
        clip: errorArea
      }

      this.logger.info('Error states captured', {
        module: 'ScreenshotService',
        operation: 'captureErrorStates',
        data: {
          sessionId,
          errorCount: errorElements.length,
          errorArea,
          options: errorOptions
        }
      })

      return await this.captureScreenshot(sessionId, errorOptions)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'ScreenshotService',
          operation: 'captureErrorStates',
          sessionId,
          parameters: { options }
        },
        'medium'
      )
      throw error
    }
  }

  async captureSemanticRegion(sessionId: string, region: string, options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    if (!this.isInitialized) {
      throw new Error('Screenshot Service not initialized')
    }

    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      // Find semantic region based on description
      const semanticRegion = await this.findSemanticRegion(sessionId, region)
      
      if (!semanticRegion) {
        this.logger.warn('Semantic region not found', {
          module: 'ScreenshotService',
          operation: 'captureSemanticRegion',
          data: { sessionId, region }
        })
        return await this.captureScreenshot(sessionId, options)
      }

      const semanticOptions: ScreenshotOptions = {
        ...options,
        clip: semanticRegion
      }

      this.logger.info('Semantic region captured', {
        module: 'ScreenshotService',
        operation: 'captureSemanticRegion',
        data: {
          sessionId,
          region,
          semanticRegion,
          options: semanticOptions
        }
      })

      return await this.captureScreenshot(sessionId, semanticOptions)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'ScreenshotService',
          operation: 'captureSemanticRegion',
          sessionId,
          parameters: { region, options }
        },
        'medium'
      )
      throw error
    }
  }

  // Private helper methods for intelligent screenshot functionality
  private async analyzePageContent(sessionId: string, description?: string): Promise<{
    targetRegion?: { x: number; y: number; width: number; height: number }
  }> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        return {}
      }

      const analysis = await connection.page.evaluate((desc) => {
        const body = (globalThis as any).document?.body
        if (!body) {
          return {}
        }

        const scrollHeight = body.scrollHeight || 0
        const clientHeight = body.clientHeight || 0
        const hasSignificantContent = scrollHeight > clientHeight * 1.5

        // Analyze content based on description if provided
        let targetRegion = undefined
        if (desc) {
          const elements = (globalThis as any).document?.querySelectorAll('*')
          for (const element of elements || []) {
            const text = element.textContent || ''
            if (text.toLowerCase().includes(desc.toLowerCase())) {
              const rect = element.getBoundingClientRect()
              targetRegion = {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              }
              break
            }
          }
        }

        return {
          ...(targetRegion && { targetRegion })
        }
      }, description)

      return analysis
    } catch (error) {
      this.logger.warn('Failed to analyze page content', {
        module: 'ScreenshotService',
        operation: 'analyzePageContent',
        error: error instanceof Error ? error : new Error(String(error))
      })
      return {}
    }
  }

  private async findMainContentArea(sessionId: string): Promise<{ x: number; y: number; width: number; height: number } | null> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        return null
      }

      const contentArea = await connection.page.evaluate(() => {
        // Try common content selectors
        const selectors = [
          'main',
          '[role="main"]',
          '.content',
          '.main-content',
          '#content',
          '#main',
          '.container',
          'article'
        ]

        for (const selector of selectors) {
          const element = (globalThis as any).document?.querySelector(selector)
          if (element) {
            const rect = element.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
              return {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              }
            }
          }
        }

        // Fallback to body if no content area found
        const body = (globalThis as any).document?.body
        if (body) {
          const rect = body.getBoundingClientRect()
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          }
        }

        return null
      })

      return contentArea
    } catch (error) {
      this.logger.warn('Failed to find main content area', {
        module: 'ScreenshotService',
        operation: 'findMainContentArea',
        error: error instanceof Error ? error : new Error(String(error))
      })
      return null
    }
  }

  private async findInteractiveElements(sessionId: string): Promise<Array<{ x: number; y: number; width: number; height: number }>> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        return []
      }

      const interactiveElements = await connection.page.evaluate(() => {
        const interactiveSelectors = [
          'button',
          'input',
          'select',
          'textarea',
          'a[href]',
          '[onclick]',
          '[role="button"]',
          '[tabindex]'
        ]

        const elements: Array<{ x: number; y: number; width: number; height: number }> = []
        
        for (const selector of interactiveSelectors) {
          const foundElements = (globalThis as any).document?.querySelectorAll(selector) || []
          for (const element of foundElements) {
            const rect = element.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
              elements.push({
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              })
            }
          }
        }

        return elements
      })

      return interactiveElements
    } catch (error) {
      this.logger.warn('Failed to find interactive elements', {
        module: 'ScreenshotService',
        operation: 'findInteractiveElements',
        error: error instanceof Error ? error : new Error(String(error))
      })
      return []
    }
  }

  private async findErrorStates(sessionId: string): Promise<Array<{ x: number; y: number; width: number; height: number }>> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        return []
      }

      const errorElements = await connection.page.evaluate(() => {
        const errorSelectors = [
          '.error',
          '.alert',
          '.alert-danger',
          '.alert-error',
          '[data-error]',
          '[aria-invalid="true"]',
          '.invalid',
          '.failed'
        ]

        const elements: Array<{ x: number; y: number; width: number; height: number }> = []
        
        for (const selector of errorSelectors) {
          const foundElements = (globalThis as any).document?.querySelectorAll(selector) || []
          for (const element of foundElements) {
            const rect = element.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
              elements.push({
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              })
            }
          }
        }

        return elements
      })

      return errorElements
    } catch (error) {
      this.logger.warn('Failed to find error states', {
        module: 'ScreenshotService',
        operation: 'findErrorStates',
        error: error instanceof Error ? error : new Error(String(error))
      })
      return []
    }
  }

  private async findSemanticRegion(sessionId: string, region: string): Promise<{ x: number; y: number; width: number; height: number } | null> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        return null
      }

      const semanticRegion = await connection.page.evaluate((regionDesc) => {
        const elements = (globalThis as any).document?.querySelectorAll('*')
        
        for (const element of elements || []) {
          const text = element.textContent || ''
          const className = element.className || ''
          const id = element.id || ''
          const role = element.getAttribute('role') || ''
          
          const searchText = regionDesc.toLowerCase()
          if (
            text.toLowerCase().includes(searchText) ||
            className.toLowerCase().includes(searchText) ||
            id.toLowerCase().includes(searchText) ||
            role.toLowerCase().includes(searchText)
          ) {
            const rect = element.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
              return {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              }
            }
          }
        }

        return null
      }, region)

      return semanticRegion
    } catch (error) {
      this.logger.warn('Failed to find semantic region', {
        module: 'ScreenshotService',
        operation: 'findSemanticRegion',
        error: error instanceof Error ? error : new Error(String(error))
      })
      return null
    }
  }

  private calculateBoundingBox(elements: Array<{ x: number; y: number; width: number; height: number }>): { x: number; y: number; width: number; height: number } {
    if (elements.length === 0) {
      return { x: 0, y: 0, width: 1920, height: 1080 }
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const element of elements) {
      minX = Math.min(minX, element.x)
      minY = Math.min(minY, element.y)
      maxX = Math.max(maxX, element.x + element.width)
      maxY = Math.max(maxY, element.y + element.height)
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
  }
}
