import { EventEmitter } from 'events'
import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { randomBytes } from 'crypto'

/**
 * SSE Server Module
 * Provides Server-Sent Events endpoints for real-time communication
 * with Cursor IDE and other clients
 */

export interface SSEClient {
  id: string
  response: Response
  lastActivity: Date
  isActive: boolean
  sessionId?: string
}

export interface SSEEvent {
  id: string
  type: string
  data: any
  timestamp: number
  sessionId?: string
}

export interface SSEServerConfig {
  port: number
  corsOrigin: string
  maxClients: number
  heartbeatInterval: number
}

export class SSEServer extends EventEmitter {
  private app: express.Application
  private clients: Map<string, SSEClient> = new Map()
  private config: SSEServerConfig
  private isInitialized: boolean = false
  private heartbeatInterval?: NodeJS.Timeout

  constructor(config: SSEServerConfig = {
    port: 3001,
    corsOrigin: '*',
    maxClients: 100,
    heartbeatInterval: 30000
  }) {
    super()
    this.config = config
    this.app = express()
    this.setupMiddleware()
    this.setupRoutes()
  }

  /**
   * Initialize the SSE server
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing SSE Server...')

      // Start the server
      const server = this.app.listen(this.config.port, () => {
        console.log(`✅ SSE Server running on port ${this.config.port}`)
        this.isInitialized = true
        this.emit('initialized')
      })

      // Set up heartbeat
      this.setupHeartbeat()

      // Handle server shutdown
      server.on('close', () => {
        this.cleanup()
      })

    } catch (error) {
      console.error('❌ Failed to initialize SSE Server:', error)
      throw error
    }
  }

  /**
   * Set up Express middleware
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'", "ws:", "wss:"]
        }
      }
    }))

    // CORS middleware
    this.app.use(cors({
      origin: this.config.corsOrigin,
      credentials: true
    }))

    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`)
      next()
    })
  }

  /**
   * Set up Express routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        clients: this.clients.size,
        isInitialized: this.isInitialized
      })
    })

    // SSE connection endpoint
    this.app.get('/events', (req: Request, res: Response) => {
      this.handleSSEConnection(req, res)
    })

    // Authentication endpoint
    this.app.post('/auth', (req: Request, res: Response) => {
      this.handleAuthentication(req, res)
    })

    // Send event endpoint
    this.app.post('/send-event', (req: Request, res: Response) => {
      this.handleSendEvent(req, res)
    })

    // Client management endpoints
    this.app.get('/clients', (req: Request, res: Response) => {
      this.handleGetClients(req, res)
    })

    this.app.delete('/clients/:clientId', (req: Request, res: Response) => {
      this.handleDisconnectClient(req, res)
    })

    // Static files for testing interface
    this.app.use(express.static('public'))
  }

  /**
   * Handle SSE connection
   */
  private handleSSEConnection(req: Request, res: Response): void {
    // Check if we have too many clients
    if (this.clients.size >= this.config.maxClients) {
      res.status(503).json({ error: 'Too many clients connected' })
      return
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': this.config.corsOrigin,
      'Access-Control-Allow-Credentials': 'true'
    })

    // Create client
    const clientId = randomBytes(16).toString('hex')
    const client: SSEClient = {
      id: clientId,
      response: res,
      lastActivity: new Date(),
      isActive: true
    }

    this.clients.set(clientId, client)

    // Send initial connection event
    this.sendEventToClient(clientId, {
      type: 'connection',
      data: {
        clientId,
        message: 'Connected to SSE Server',
        timestamp: Date.now()
      },
      timestamp: Date.now()
    })

    // Handle client disconnect
    req.on('close', () => {
      this.disconnectClient(clientId)
    })

    req.on('error', (error) => {
      console.error('SSE connection error:', error)
      this.disconnectClient(clientId)
    })

    console.log(`🔗 New SSE client connected: ${clientId}`)
    this.emit('clientConnected', clientId)
  }

  /**
   * Handle authentication
   */
  private handleAuthentication(req: Request, res: Response): void {
    try {
      const { clientId, sessionId } = req.body

      if (!clientId) {
        res.status(400).json({ error: 'clientId is required' })
        return
      }

      const client = this.clients.get(clientId)
      if (!client) {
        res.status(404).json({ error: 'Client not found' })
        return
      }

      // Update client with session ID
      client.sessionId = sessionId
      client.lastActivity = new Date()

      // Send authentication success event
      this.sendEventToClient(clientId, {
        type: 'auth_success',
        data: {
          clientId,
          sessionId,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      })

      res.json({ success: true, clientId, sessionId })
      this.emit('clientAuthenticated', clientId, sessionId)

    } catch (error) {
      console.error('Authentication error:', error)
      res.status(500).json({ error: 'Authentication failed' })
    }
  }

  /**
   * Handle sending events
   */
  private handleSendEvent(req: Request, res: Response): void {
    try {
      const { clientId, type, data, sessionId } = req.body

      if (!clientId || !type) {
        res.status(400).json({ error: 'clientId and type are required' })
        return
      }

      const client = this.clients.get(clientId)
      if (!client) {
        res.status(404).json({ error: 'Client not found' })
        return
      }

      // Send event to client
      this.sendEventToClient(clientId, {
        type,
        data,
        sessionId,
        timestamp: Date.now()
      })

      res.json({ success: true })
      this.emit('eventSent', clientId, type, data)

    } catch (error) {
      console.error('Send event error:', error)
      res.status(500).json({ error: 'Failed to send event' })
    }
  }

  /**
   * Handle getting clients
   */
  private handleGetClients(req: Request, res: Response): void {
    const clients = Array.from(this.clients.values()).map(client => ({
      id: client.id,
      sessionId: client.sessionId,
      lastActivity: client.lastActivity,
      isActive: client.isActive
    }))

    res.json({ clients })
  }

  /**
   * Handle disconnecting client
   */
  private handleDisconnectClient(req: Request, res: Response): void {
    const { clientId } = req.params

    if (clientId && this.disconnectClient(clientId)) {
      res.json({ success: true, message: 'Client disconnected' })
    } else {
      res.status(404).json({ error: 'Client not found' })
    }
  }

  /**
   * Send event to specific client
   */
  sendEventToClient(clientId: string, event: Omit<SSEEvent, 'id'>): void {
    const client = this.clients.get(clientId)
    if (!client || !client.isActive) {
      return
    }

    const sseEvent: SSEEvent = {
      id: randomBytes(8).toString('hex'),
      ...event
    }

    const eventData = `id: ${sseEvent.id}\n` +
                     `event: ${sseEvent.type}\n` +
                     `data: ${JSON.stringify(sseEvent.data)}\n` +
                     `timestamp: ${sseEvent.timestamp}\n\n`

    try {
      client.response.write(eventData)
      client.lastActivity = new Date()
    } catch (error) {
      console.error('Error sending event to client:', error)
      this.disconnectClient(clientId)
    }
  }

  /**
   * Broadcast event to all clients
   */
  broadcastEvent(event: Omit<SSEEvent, 'id'>): void {
    const clientIds = Array.from(this.clients.keys())
    for (const clientId of clientIds) {
      this.sendEventToClient(clientId, event)
    }
  }

  /**
   * Broadcast event to clients with specific session
   */
  broadcastToSession(sessionId: string, event: Omit<SSEEvent, 'id'>): void {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.sessionId === sessionId && client.isActive) {
        this.sendEventToClient(clientId, event)
      }
    }
  }

  /**
   * Disconnect a client
   */
  disconnectClient(clientId: string): boolean {
    const client = this.clients.get(clientId)
    if (!client) {
      return false
    }

    try {
      client.response.end()
    } catch (error) {
      console.error('Error ending client response:', error)
    }

    client.isActive = false
    this.clients.delete(clientId)
    this.emit('clientDisconnected', clientId)
    console.log(`🔌 SSE client disconnected: ${clientId}`)
    return true
  }

  /**
   * Set up heartbeat to keep connections alive
   */
  private setupHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.broadcastEvent({
        type: 'heartbeat',
        data: { timestamp: Date.now() },
        timestamp: Date.now()
      })
    }, this.config.heartbeatInterval)
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    // Disconnect all clients
    for (const clientId of this.clients.keys()) {
      this.disconnectClient(clientId)
    }

    this.isInitialized = false
    this.emit('shutdown')
  }

  /**
   * Get server status
   */
  getStatus(): {
    isInitialized: boolean
    port: number
    activeClients: number
    maxClients: number
  } {
    return {
      isInitialized: this.isInitialized,
      port: this.config.port,
      activeClients: this.clients.size,
      maxClients: this.config.maxClients
    }
  }

  /**
   * Shutdown the SSE server
   */
  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down SSE Server...')
    this.cleanup()
    console.log('✅ SSE Server shutdown complete')
  }
} 