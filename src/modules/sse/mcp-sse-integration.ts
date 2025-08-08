import { MCPSSEServer } from './mcp-sse-server.js'
import { MCPSSEClient } from './mcp-sse-client.js'
import { SSEServer } from './sse-server.js'
import { MCPBridge } from './mcp-bridge.js'

/**
 * MCP SSE Integration Module
 * 
 * InDOM MCP SSE Integration
 * Provides real-time communication between MCP server and SSE clients
 * 
 * @author InDOM Team
 * @version 1.0.0
 */

export class MCPSSEIntegration {
  private mcpServer: MCPSSEServer
  private sseServer: SSEServer
  private mcpBridge: MCPBridge
  private isInitialized: boolean = false

  constructor() {
    // Initialize MCP SSE Server
    this.mcpServer = new MCPSSEServer({
      port: 3000,
      corsOrigin: "*",
      serverName: "indom-mcp-server",
      serverVersion: "1.0.0"
    })

    // Initialize existing SSE Server
    this.sseServer = new SSEServer({
      port: 3001,
      corsOrigin: "*",
      maxClients: 100,
      heartbeatInterval: 30000
    })

    // Initialize MCP Bridge
    this.mcpBridge = new MCPBridge(
      this.sseServer,
      this.mcpServer as any, // Type assertion for compatibility
      {
        enableAutoForwarding: true,
        enableProgressTracking: true,
        enableErrorReporting: true,
        maxRetries: 3,
        retryDelay: 1000
      }
    )
  }

  /**
   * Initialize the integrated system
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing InDOM MCP SSE Integration...')

      // Start the MCP SSE server
      await this.mcpServer.initialize()
      console.log('✅ MCP SSE Server initialized')

      // Start the existing SSE server
      await this.sseServer.initialize()
      console.log('✅ Existing SSE Server initialized')

      // Initialize the MCP bridge
      await this.mcpBridge.initialize()
      console.log('✅ MCP Bridge initialized')

      this.isInitialized = true
      console.log('🎉 InDOM MCP SSE Integration ready!')

    } catch (error) {
      console.error('❌ Failed to initialize InDOM MCP SSE Integration:', error)
      throw error
    }
  }

  /**
   * Get status of all components
   */
  getStatus(): {
    mcpServer: any
    sseServer: any
    mcpBridge: any
    isInitialized: boolean
  } {
    return {
      mcpServer: this.mcpServer.getStatus(),
      sseServer: this.sseServer.getStatus(),
      mcpBridge: this.mcpBridge.getStatus(),
      isInitialized: this.isInitialized
    }
  }

  /**
   * Shutdown the integrated system
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down InDOM MCP SSE Integration...')

    try {
      await this.mcpBridge.shutdown()
      await this.sseServer.shutdown()
      await this.mcpServer.shutdown()
      
      this.isInitialized = false
      console.log('✅ InDOM MCP SSE Integration shutdown complete')
    } catch (error) {
      console.error('❌ Error during shutdown:', error)
    }
  }
}

/**
 * Example usage of the integrated system
 */
export async function exampleIntegration(): Promise<void> {
  const integration = new MCPSSEIntegration()

  try {
    // Initialize the system
    await integration.initialize()
    console.log('📊 System Status:', integration.getStatus())

    // Create a client to test the MCP SSE server
    const client = new MCPSSEClient({
      serverUrl: "http://localhost:3000/mcp",
      enableNotifications: true,
      enableAutoReconnect: true,
      maxReconnectAttempts: 3,
      reconnectDelay: 1000
    })

    // Test the connection
    await client.connectToServer("http://localhost:3000/mcp")
    console.log('✅ Client connected successfully')

    // List available tools
    const tools = await client.listTools()
    console.log('📋 Available tools:', tools)

    // Test a tool call
    if (tools.length > 0) {
      const firstTool = tools[0]
      if (firstTool) {
        await client.callTool(firstTool.name, { test: "data" })
      }
    }

    // Wait for completion
    await client.waitForCompletion()

    console.log('✅ Integration test completed successfully')

  } catch (error) {
    console.error('❌ Integration test failed:', error)
  } finally {
    // Cleanup
    await integration.shutdown()
  }
} 