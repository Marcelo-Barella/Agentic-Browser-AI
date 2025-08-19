import { EventEmitter } from 'events'
import { getLogger } from '../../core/logger.js'
import { ErrorHandler } from '../../core/error-handler.js'
import { CDPConnectionManager } from './cdp-connection-manager.js'

export interface NetworkRequest {
  id: string
  url: string
  method: string
  headers: Record<string, string>
  postData?: string
  timestamp: Date
  sessionId: string
}

export interface NetworkResponse {
  requestId: string
  url: string
  status: number
  statusText: string
  headers: Record<string, string>
  body?: string
  timestamp: Date
  loadTime: number
  size: number
}

export interface NetworkMetrics {
  totalRequests: number
  totalResponses: number
  averageLoadTime: number
  successRate: number
  errorRate: number
  bandwidthUsage: number
  requestsByMethod: Record<string, number>
  requestsByDomain: Record<string, number>
  responsesByStatus: Record<number, number>
}

export interface SecurityThreat {
  type: 'xss' | 'injection' | 'malicious_url' | 'suspicious_content' | 'data_exfiltration'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  requestId?: string
  url?: string
  payload?: string
  timestamp: Date
}

export interface APICall {
  url: string
  method: string
  headers: Record<string, string>
  payload?: any
  response: {
    status: number
    data?: any
    headers: Record<string, string>
  }
  timestamp: Date
  duration: number
}

export class NetworkMonitor extends EventEmitter {
  private cdpManager: CDPConnectionManager
  private logger: any
  private errorHandler: ErrorHandler
  private requests: Map<string, NetworkRequest> = new Map()
  private responses: Map<string, NetworkResponse> = new Map()
  private apiCalls: APICall[] = []
  private securityThreats: SecurityThreat[] = []
  private metrics: NetworkMetrics
  private isInitialized: boolean = false
  private monitoringSessions: Set<string> = new Set()

  constructor(cdpManager: CDPConnectionManager) {
    super()
    this.cdpManager = cdpManager
    this.logger = getLogger()
    this.errorHandler = new ErrorHandler()
    this.metrics = this.initializeMetrics()
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      await this.errorHandler.initialize()
      this.isInitialized = true
      this.emit('initialized')
      
      this.logger.info('Network Monitor initialized successfully', {
        module: 'NetworkMonitor',
        operation: 'initialize'
      })
    } catch (error) {
      this.logger.error('Failed to initialize Network Monitor', {
        module: 'NetworkMonitor',
        operation: 'initialize',
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`Network Monitor initialization failed: ${error}`)
    }
  }

  async startMonitoring(sessionId: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Network Monitor not initialized')
    }

    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      await connection.cdpSession.send('Network.enable')
      
      connection.cdpSession.on('Network.requestWillBeSent', (params: any) => {
        this.handleRequestWillBeSent(sessionId, params)
      })

      connection.cdpSession.on('Network.responseReceived', (params: any) => {
        this.handleResponseReceived(sessionId, params)
      })

      connection.cdpSession.on('Network.loadingFinished', (params: any) => {
        this.handleLoadingFinished(sessionId, params)
      })

      connection.cdpSession.on('Network.loadingFailed', (params: any) => {
        this.handleLoadingFailed(sessionId, params)
      })

      this.monitoringSessions.add(sessionId)
      
      this.logger.info('Network monitoring started', {
        module: 'NetworkMonitor',
        operation: 'startMonitoring',
        data: { sessionId }
      })
      
      this.emit('monitoringStarted', sessionId)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'NetworkMonitor',
          operation: 'startMonitoring',
          sessionId
        },
        'medium'
      )
      throw error
    }
  }

  async stopMonitoring(sessionId: string): Promise<void> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        return
      }

      await connection.cdpSession.send('Network.disable')
      this.monitoringSessions.delete(sessionId)
      
      this.logger.info('Network monitoring stopped', {
        module: 'NetworkMonitor',
        operation: 'stopMonitoring',
        data: { sessionId }
      })
      
      this.emit('monitoringStopped', sessionId)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'NetworkMonitor',
          operation: 'stopMonitoring',
          sessionId
        },
        'low'
      )
    }
  }

  private handleRequestWillBeSent(sessionId: string, params: any): void {
    try {
      const request: NetworkRequest = {
        id: params.requestId,
        url: params.request.url,
        method: params.request.method,
        headers: params.request.headers || {},
        postData: params.request.postData,
        timestamp: new Date(),
        sessionId
      }

      this.requests.set(params.requestId, request)
      this.updateMetrics()
      
      this.analyzeSecurityThreats(request)
      
      this.logger.debug('Network request captured', {
        module: 'NetworkMonitor',
        operation: 'handleRequestWillBeSent',
        data: {
          sessionId,
          requestId: params.requestId,
          url: request.url,
          method: request.method
        }
      })
      
      this.emit('requestCaptured', sessionId, request)
    } catch (error) {
      this.logger.error('Failed to handle request', {
        module: 'NetworkMonitor',
        operation: 'handleRequestWillBeSent',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, params }
      })
    }
  }

  private handleResponseReceived(sessionId: string, params: any): void {
    try {
      const response: NetworkResponse = {
        requestId: params.requestId,
        url: params.response.url,
        status: params.response.status,
        statusText: params.response.statusText,
        headers: params.response.headers || {},
        timestamp: new Date(),
        loadTime: 0,
        size: 0
      }

      this.responses.set(params.requestId, response)
      
      this.logger.debug('Network response captured', {
        module: 'NetworkMonitor',
        operation: 'handleResponseReceived',
        data: {
          sessionId,
          requestId: params.requestId,
          url: response.url,
          status: response.status
        }
      })
      
      this.emit('responseCaptured', sessionId, response)
    } catch (error) {
      this.logger.error('Failed to handle response', {
        module: 'NetworkMonitor',
        operation: 'handleResponseReceived',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, params }
      })
    }
  }

  private handleLoadingFinished(sessionId: string, params: any): void {
    try {
      const response = this.responses.get(params.requestId)
      if (response) {
        response.loadTime = params.timestamp
        response.size = params.encodedDataLength || 0
      }

      this.updateMetrics()
      
      this.logger.debug('Network loading finished', {
        module: 'NetworkMonitor',
        operation: 'handleLoadingFinished',
        data: {
          sessionId,
          requestId: params.requestId,
          loadTime: response?.loadTime,
          size: response?.size
        }
      })
      
      this.emit('loadingFinished', sessionId, params.requestId)
    } catch (error) {
      this.logger.error('Failed to handle loading finished', {
        module: 'NetworkMonitor',
        operation: 'handleLoadingFinished',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, params }
      })
    }
  }

  private handleLoadingFailed(sessionId: string, params: any): void {
    try {
      this.logger.warn('Network loading failed', {
        module: 'NetworkMonitor',
        operation: 'handleLoadingFailed',
        data: {
          sessionId,
          requestId: params.requestId,
          errorText: params.errorText,
          type: params.type
        }
      })
      
      this.emit('loadingFailed', sessionId, params)
    } catch (error) {
      this.logger.error('Failed to handle loading failed', {
        module: 'NetworkMonitor',
        operation: 'handleLoadingFailed',
        error: error instanceof Error ? error : new Error(String(error)),
        data: { sessionId, params }
      })
    }
  }

  private analyzeSecurityThreats(request: NetworkRequest): void {
    const threats: SecurityThreat[] = []

    const url = request.url.toLowerCase()
    const headers = Object.values(request.headers).join(' ').toLowerCase()
    const postData = request.postData?.toLowerCase() || ''

    const combinedContent = `${url} ${headers} ${postData}`

    // Skip analysis for known safe domains
    const safeDomains = [
      'saucedemo.com',
      'example.com',
      'localhost',
      '127.0.0.1'
    ]
    
    const isSafeDomain = safeDomains.some(domain => url.includes(domain))
    if (isSafeDomain) {
      return
    }

    const threatPatterns = [
      {
        type: 'xss' as const,
        patterns: [
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          /javascript:/gi,
          /on\w+\s*=\s*["'][^"']*["']/gi
        ],
        severity: 'high' as const
      },
      {
        type: 'injection' as const,
        patterns: [
          /union\s+select/gi,
          /drop\s+table/gi,
          /insert\s+into/gi,
          /delete\s+from/gi
        ],
        severity: 'critical' as const
      },
      {
        type: 'malicious_url' as const,
        patterns: [
          /phishing/gi,
          /malware/gi,
          /suspicious/gi
        ],
        severity: 'medium' as const
      },
      {
        type: 'data_exfiltration' as const,
        patterns: [
          /password\s*=\s*["'][^"']*["']/gi,
          /credit.?card\s*=\s*["'][^"']*["']/gi,
          /ssn\s*=\s*["'][^"']*["']/gi,
          /social.?security\s*=\s*["'][^"']*["']/gi
        ],
        severity: 'high' as const
      }
    ]

    for (const threat of threatPatterns) {
      for (const pattern of threat.patterns) {
        if (pattern.test(combinedContent)) {
          threats.push({
            type: threat.type,
            severity: threat.severity,
            description: `Detected ${threat.type} pattern in request`,
            requestId: request.id,
            url: request.url,
            payload: combinedContent.substring(0, 200),
            timestamp: new Date()
          })
        }
      }
    }

    if (threats.length > 0) {
      this.securityThreats.push(...threats)
      
      this.logger.warn('Security threats detected', {
        module: 'NetworkMonitor',
        operation: 'analyzeSecurityThreats',
        data: {
          sessionId: request.sessionId,
          requestId: request.id,
          threats: threats.map(t => ({ type: t.type, severity: t.severity }))
        }
      })
      
      this.emit('securityThreatsDetected', request.sessionId, threats)
    }
  }

  private updateMetrics(): void {
    const totalRequests = this.requests.size
    const totalResponses = this.responses.size
    const loadTimes = Array.from(this.responses.values())
      .map(r => r.loadTime)
      .filter(lt => lt > 0)
    
    const averageLoadTime = loadTimes.length > 0 
      ? loadTimes.reduce((sum, lt) => sum + lt, 0) / loadTimes.length 
      : 0

    const successResponses = Array.from(this.responses.values())
      .filter(r => r.status >= 200 && r.status < 300).length
    const errorResponses = Array.from(this.responses.values())
      .filter(r => r.status >= 400).length

    const successRate = totalResponses > 0 ? (successResponses / totalResponses) * 100 : 0
    const errorRate = totalResponses > 0 ? (errorResponses / totalResponses) * 100 : 0

    const bandwidthUsage = Array.from(this.responses.values())
      .reduce((sum, r) => sum + r.size, 0)

    const requestsByMethod: Record<string, number> = {}
    const requestsByDomain: Record<string, number> = {}
    const responsesByStatus: Record<number, number> = {}

    for (const request of this.requests.values()) {
      requestsByMethod[request.method] = (requestsByMethod[request.method] || 0) + 1
      
      try {
        const domain = new URL(request.url).hostname
        requestsByDomain[domain] = (requestsByDomain[domain] || 0) + 1
      } catch {
        requestsByDomain['unknown'] = (requestsByDomain['unknown'] || 0) + 1
      }
    }

    for (const response of this.responses.values()) {
      responsesByStatus[response.status] = (responsesByStatus[response.status] || 0) + 1
    }

    this.metrics = {
      totalRequests,
      totalResponses,
      averageLoadTime,
      successRate,
      errorRate,
      bandwidthUsage,
      requestsByMethod,
      requestsByDomain,
      responsesByStatus
    }
  }

  private initializeMetrics(): NetworkMetrics {
    return {
      totalRequests: 0,
      totalResponses: 0,
      averageLoadTime: 0,
      successRate: 0,
      errorRate: 0,
      bandwidthUsage: 0,
      requestsByMethod: {},
      requestsByDomain: {},
      responsesByStatus: {}
    }
  }

  getNetworkMetrics(): NetworkMetrics {
    return { ...this.metrics }
  }

  getSecurityThreats(): SecurityThreat[] {
    return [...this.securityThreats]
  }

  getAPICalls(): APICall[] {
    return [...this.apiCalls]
  }

  getRequestsBySession(sessionId: string): NetworkRequest[] {
    return Array.from(this.requests.values())
      .filter(r => r.sessionId === sessionId)
  }

  getResponsesBySession(sessionId: string): NetworkResponse[] {
    return Array.from(this.responses.values())
      .filter(r => {
        const request = this.requests.get(r.requestId)
        return request?.sessionId === sessionId
      })
  }

  clearData(): void {
    this.requests.clear()
    this.responses.clear()
    this.apiCalls = []
    this.securityThreats = []
    this.metrics = this.initializeMetrics()
    
    this.logger.info('Network monitor data cleared', {
      module: 'NetworkMonitor',
      operation: 'clearData'
    })
  }

  isMonitoring(sessionId: string): boolean {
    return this.monitoringSessions.has(sessionId)
  }

  getMonitoringSessions(): string[] {
    return Array.from(this.monitoringSessions)
  }

  isReady(): boolean {
    return this.isInitialized
  }

  async shutdown(): Promise<void> {
    for (const sessionId of this.monitoringSessions) {
      await this.stopMonitoring(sessionId)
    }
    
    this.monitoringSessions.clear()
    this.isInitialized = false
    this.emit('shutdown')
  }
}
