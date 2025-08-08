/**
 * SSE Module - Phase 4
 * Main entry point for Server-Sent Events functionality
 * Provides unified interface for SSE server, client, and MCP integration
 */

export { SSEServer } from './sse-server.js'
export type { SSEServerConfig, SSEClient, SSEEvent } from './sse-server.js'
export { MCPBridge } from './mcp-bridge.js'
export type { MCPBridgeConfig, MCPRequest, MCPResponse } from './mcp-bridge.js'
export { MCPSSEServer } from './mcp-sse-server.js'
export type { MCPServerConfig } from './mcp-sse-server.js'
export { MCPSSEClient, exampleMCPSSEClient } from './mcp-sse-client.js'
export type { MCPClientConfig, MCPTool } from './mcp-sse-client.js' 