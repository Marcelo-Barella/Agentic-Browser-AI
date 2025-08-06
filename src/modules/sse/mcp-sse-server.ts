import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import express, { Request, Response } from "express"
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"
import cors from "cors"
import helmet from "helmet"

/**
 * MCP SSE Server Implementation
 * Follows the official Model Context Protocol specification for SSE transport
 * Based on the Medium article: https://medium.com/@itsuki.enjoy/mcp-server-and-client-with-sse-the-new-streamable-http-d860850d9d9d
 */

export interface MCPServerConfig {
  port: number
  corsOrigin: string
  serverName: string
  serverVersion: string
}

export class MCPSSEServer {
  private server!: Server
  private app: express.Application
  private config: MCPServerConfig
  private transports: { [sessionId: string]: SSEServerTransport } = {}
  private isInitialized: boolean = false

  constructor(config: MCPServerConfig = {
    port: 3000,
    corsOrigin: "*",
    serverName: "agentic-ai-mcp-server",
    serverVersion: "1.0.0"
  }) {
    this.config = config
    this.app = express()
    this.setupServer()
    this.setupMiddleware()
    this.setupRoutes()
  }

  /**
   * Set up the MCP server instance
   */
  private setupServer(): void {
    this.server = new Server({
      name: this.config.serverName,
      version: this.config.serverVersion
    })
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

    // JSON parsing middleware
    this.app.use(express.json())
  }

  /**
   * Set up Express routes
   */
  private setupRoutes(): void {
    const router = express.Router()

    // Endpoint for the client to use for sending messages
    const POST_ENDPOINT = "/messages"

    // POST endpoint for handling JSON-RPC messages from the client
    router.post(POST_ENDPOINT, async (req: Request, res: Response) => {
      console.log("MCP message request received:", req.body)
      
      // When client sends messages with SSEClientTransport,
      // the sessionId will be atomically set as query parameter
      const sessionId = req.query.sessionId

      if (typeof sessionId !== "string") {
        res.status(400).send({ message: "Bad session id." })
        return
      }

      const transport = this.transports[sessionId]
      if (!transport) {
        res.status(400).send({ message: "No transport found for sessionId." })
        return
      }

      // Handle the POST message using the transport
      await transport.handlePostMessage(req, res)
    })

    // GET endpoint for establishing connection
    router.get("/connect", async (req: Request, res: Response) => {
      console.log("MCP connection request received")
      
      // Create a new transport and tell the client to send messages to POST_ENDPOINT
      const transport = new SSEServerTransport(POST_ENDPOINT, res)
      console.log("New MCP transport created with session id:", transport.sessionId)

      this.transports[transport.sessionId] = transport

      // Handle connection close
      res.on("close", () => {
        console.log("MCP SSE connection closed for session:", transport.sessionId)
        delete this.transports[transport.sessionId]
      })

      // Connect the transport to the MCP server
      await this.server.connect(transport)

      // Send initial connection event
      await this.sendConnectionEvent(transport)
    })

    this.app.use("/mcp", router)
  }

  /**
   * Send connection event to client
   */
  private async sendConnectionEvent(transport: SSEServerTransport): Promise<void> {
    try {
      await transport.send({
        jsonrpc: "2.0",
        method: "sse/connection",
        params: { message: "MCP SSE connection established" }
      })
      console.log("MCP SSE connection established")

      // Send periodic messages to demonstrate streaming
      let messageCount = 0
      const interval = setInterval(async () => {
        messageCount++
        const message = `MCP Server Message ${messageCount} at ${new Date().toISOString()}`

        try {
          await transport.send({
            jsonrpc: "2.0",
            method: "notifications/message",
            params: { level: "info", data: message }
          })

          console.log(`Sent: ${message}`)

          if (messageCount === 5) {
            clearInterval(interval)
            await transport.send({
              jsonrpc: "2.0",
              method: "sse/complete",
              params: { message: "MCP SSE stream completed" }
            })
            console.log("MCP SSE stream completed")
          }
        } catch (error) {
          console.error("Error sending message:", error)
          clearInterval(interval)
        }
      }, 2000)
    } catch (error) {
      console.error("Error in sendConnectionEvent:", error)
    }
  }

  /**
   * Initialize the MCP SSE server
   */
  async initialize(): Promise<void> {
    try {
      console.log("🚀 Initializing MCP SSE Server...")

      const server = this.app.listen(this.config.port, () => {
        console.log(`✅ MCP SSE Server running on port ${this.config.port}`)
        console.log(`📡 MCP endpoint: http://localhost:${this.config.port}/mcp/connect`)
        this.isInitialized = true
      })

      // Handle server shutdown
      server.on("close", () => {
        console.log("🛑 MCP SSE Server shutting down...")
      })

    } catch (error) {
      console.error("❌ Failed to initialize MCP SSE Server:", error)
      throw error
    }
  }

  /**
   * Get server status
   */
  getStatus(): {
    isInitialized: boolean
    port: number
    activeConnections: number
    serverName: string
    serverVersion: string
  } {
    return {
      isInitialized: this.isInitialized,
      port: this.config.port,
      activeConnections: Object.keys(this.transports).length,
      serverName: this.config.serverName,
      serverVersion: this.config.serverVersion
    }
  }

  /**
   * Shutdown the server
   */
  async shutdown(): Promise<void> {
    console.log("🛑 Shutting down MCP SSE Server...")
    
    // Close all active transports
    for (const [sessionId, transport] of Object.entries(this.transports)) {
      try {
        await transport.close()
        console.log(`Closed transport for session: ${sessionId}`)
      } catch (error) {
        console.error(`Error closing transport for session ${sessionId}:`, error)
      }
    }

    this.transports = {}
    this.isInitialized = false
  }
} 