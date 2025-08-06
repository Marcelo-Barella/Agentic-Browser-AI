/**
 * SSE Module - Phase 4
 * Main entry point for Server-Sent Events functionality
 * Provides unified interface for SSE server, client, and MCP integration
 */

export { SSEServer } from './sse-server'
export type { SSEServerConfig, SSEClient, SSEEvent } from './sse-server'
export { MCPBridge } from './mcp-bridge'
export type { MCPBridgeConfig, MCPRequest, MCPResponse } from './mcp-bridge'
export { MCPSSEServer } from './mcp-sse-server'
export type { MCPServerConfig } from './mcp-sse-server'
export { MCPSSEClient, exampleMCPSSEClient } from './mcp-sse-client'
export type { MCPClientConfig, MCPTool } from './mcp-sse-client' 