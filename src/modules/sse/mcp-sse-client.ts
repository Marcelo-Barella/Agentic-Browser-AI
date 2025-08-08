import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { TextContentSchema } from "@modelcontextprotocol/sdk/types.js"
import { LoggingMessageNotificationSchema, ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js"

// Add EventSource polyfill for Node.js
import { EventSource } from "eventsource"

// Make EventSource available globally for the MCP SDK
if (typeof global !== 'undefined' && !global.EventSource) {
  (global as any).EventSource = EventSource
}

/**
 * MCP SSE Client Implementation
 * Follows the official Model Context Protocol specification for SSE transport
 * Based on the Medium article: https://medium.com/@itsuki.enjoy/mcp-server-and-client-with-sse-the-new-streamable-http-d860850d9d9d
 */

export interface MCPClientConfig {
  serverUrl: string
  enableNotifications: boolean
  enableAutoReconnect: boolean
  maxReconnectAttempts: number
  reconnectDelay: number
}

export interface MCPTool {
  name: string
  description: string
}

export class MCPSSEClient {
  private client!: Client
  private transport: SSEClientTransport | null = null
  private config: MCPClientConfig
  private tools: MCPTool[] = []
  private isCompleted: boolean = false
  private reconnectAttempts: number = 0

  constructor(config: MCPClientConfig) {
    this.config = config
  }

  /**
   * Connect to the MCP SSE server
   */
  async connectToServer(serverUrl: string): Promise<void> {
    try {
      console.log("🔗 Connecting to MCP SSE server:", serverUrl)

      // Create SSE client transport
      this.transport = new SSEClientTransport(new URL(serverUrl))

      // Set up transport event handlers
      this.setupTransport()

      // Create MCP client
      this.client = new Client({
        name: "indom-mcp-client",
        version: "1.0.0"
      })

      // Connect client to transport
      await this.client.connect(this.transport)

      // Set up notification handlers
      this.setupNotifications()

      console.log("✅ Connected to MCP SSE server")

    } catch (error) {
      console.error("❌ Failed to connect to MCP SSE server:", error)
      
      if (this.config.enableAutoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
        this.reconnectAttempts++
        console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})...`)
        
        setTimeout(() => {
          this.connectToServer(serverUrl)
        }, this.config.reconnectDelay)
      } else {
        throw error
      }
    }
  }

  /**
   * List available tools from the server
   */
  async listTools(): Promise<MCPTool[]> {
    try {
      const toolsResult = await this.client.listTools()
      console.log("📋 Available tools:", toolsResult.tools)
      
      this.tools = toolsResult.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? ""
      }))

      return this.tools
    } catch (error) {
      console.error("❌ Error listing tools:", error)
      return []
    }
  }

  /**
   * Call a specific tool
   */
  async callTool(name: string, toolArgs: Record<string, any> = {}): Promise<any> {
    try {
      console.log(`🔧 Calling tool: ${name}`)

      const result = await this.client.callTool({
        name: name,
        arguments: toolArgs
      })

      const content = result.content as object[]

      console.log("📄 Tool results:")
      content.forEach((item) => {
        const parse = TextContentSchema.safeParse(item)
        if (parse.success) {
          console.log(`- ${parse.data.text}`)
        }
      })

      return result
    } catch (error) {
      console.error(`❌ Error calling tool ${name}:`, error)
      throw error
    }
  }

  /**
   * Set up notification handlers for server-initiated messages
   */
  private setupNotifications(): void {
    if (!this.config.enableNotifications) return

    // Handle logging message notifications
    this.client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
      console.log("📝 LoggingMessageNotification received:", notification)
    })

    // Handle tool list change notifications
    this.client.setNotificationHandler(ToolListChangedNotificationSchema, async (notification) => {
      console.log("🔄 ToolListChangedNotification received:", notification)
      await this.listTools()
    })
  }

  /**
   * Set up transport event handlers
   */
  private setupTransport(): void {
    if (!this.transport) return

    this.transport.onclose = () => {
      console.log("🔌 MCP SSE transport closed")
      this.isCompleted = true
    }

    this.transport.onerror = async (error) => {
      console.error("❌ MCP SSE transport error:", error)
      await this.cleanup()
    }
  }

  /**
   * Wait for completion (useful for long-running operations)
   */
  async waitForCompletion(): Promise<void> {
    while (!this.isCompleted) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close()
      }
      console.log("🧹 MCP SSE client cleaned up")
    } catch (error) {
      console.error("❌ Error during cleanup:", error)
    }
  }

  /**
   * Get client status
   */
  getStatus(): {
    isConnected: boolean
    toolsCount: number
    reconnectAttempts: number
    isCompleted: boolean
  } {
    return {
      isConnected: this.transport !== null && !this.isCompleted,
      toolsCount: this.tools.length,
      reconnectAttempts: this.reconnectAttempts,
      isCompleted: this.isCompleted
    }
  }

  /**
   * Get available tools
   */
  getTools(): MCPTool[] {
    return this.tools
  }
}

/**
 * Example usage of MCP SSE Client
 */
export async function exampleMCPSSEClient(): Promise<void> {
  const client = new MCPSSEClient({
    serverUrl: "http://localhost:3000/mcp",
    enableNotifications: true,
    enableAutoReconnect: true,
    maxReconnectAttempts: 3,
    reconnectDelay: 1000
  })

  try {
    // Connect to server
    await client.connectToServer("http://localhost:3000/mcp")

    // List available tools
    await client.listTools()

    // Call tools
    const tools = client.getTools()
    for (const tool of tools) {
      await client.callTool(tool.name, { name: "test" })
    }

    // Wait for completion
    await client.waitForCompletion()

  } catch (error) {
    console.error("❌ Example client error:", error)
  } finally {
    await client.cleanup()
  }
} 