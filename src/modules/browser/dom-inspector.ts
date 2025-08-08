import { CDPConnectionManager, CDPRequest } from './cdp-connection-manager.js'

export interface DOMElement {
  nodeId: number
  nodeType: number
  nodeName: string
  nodeValue: string
  attributes: { name: string; value: string }[]
  childNodeCount: number
  children?: DOMElement[]
  computedStyle?: { [key: string]: string }
  boundingBox?: {
    x: number
    y: number
    width: number
    height: number
  }
  isVisible?: boolean
  tagName?: string
  className?: string
  id?: string
}

export interface DOMInspectionOptions {
  includeComputedStyles?: boolean
  includeBoundingBox?: boolean
  includeVisibility?: boolean
  maxDepth?: number
  filterSelector?: string
}

export interface DOMQueryResult {
  elements: DOMElement[]
  totalCount: number
  queryTime: number
}

export class DOMInspector {
  private cdpManager: CDPConnectionManager

  constructor(cdpManager: CDPConnectionManager) {
    this.cdpManager = cdpManager
  }

  async getDocument(sessionId: string): Promise<DOMElement> {
    const request: CDPRequest = {
      id: 'getDocument',
      method: 'DOM.getDocument',
      params: { depth: -1, pierce: true }
    }

    const response = await this.cdpManager.executeCDPCommand(sessionId, request)
    
    if (response.error) {
      throw new Error(`Failed to get document: ${response.error.message}`)
    }

    return this.processDOMNode(response.result.root)
  }

  async querySelector(sessionId: string, selector: string): Promise<DOMElement | null> {
    const request: CDPRequest = {
      id: 'querySelector',
      method: 'DOM.querySelector',
      params: { nodeId: 1, selector }
    }

    const response = await this.cdpManager.executeCDPCommand(sessionId, request)
    
    if (response.error) {
      throw new Error(`Failed to query selector: ${response.error.message}`)
    }

    if (!response.result.nodeId) {
      return null
    }

    return this.getNodeById(sessionId, response.result.nodeId)
  }

  async querySelectorAll(sessionId: string, selector: string): Promise<DOMElement[]> {
    const request: CDPRequest = {
      id: 'querySelectorAll',
      method: 'DOM.querySelectorAll',
      params: { nodeId: 1, selector }
    }

    const response = await this.cdpManager.executeCDPCommand(sessionId, request)
    
    if (response.error) {
      throw new Error(`Failed to query selector all: ${response.error.message}`)
    }

    const elements: DOMElement[] = []
    for (const nodeId of response.result.nodeIds) {
      const element = await this.getNodeById(sessionId, nodeId)
      if (element) {
        elements.push(element)
      }
    }

    return elements
  }

  async getNodeById(sessionId: string, nodeId: number): Promise<DOMElement | null> {
    const request: CDPRequest = {
      id: 'getNodeById',
      method: 'DOM.describeNode',
      params: { nodeId }
    }

    const response = await this.cdpManager.executeCDPCommand(sessionId, request)
    
    if (response.error) {
      throw new Error(`Failed to get node by ID: ${response.error.message}`)
    }

    return this.processDOMNode(response.result.node)
  }

  async getComputedStyles(sessionId: string, nodeId: number): Promise<{ [key: string]: string }> {
    const request: CDPRequest = {
      id: 'getComputedStyles',
      method: 'CSS.getComputedStyleForNode',
      params: { nodeId }
    }

    const response = await this.cdpManager.executeCDPCommand(sessionId, request)
    
    if (response.error) {
      throw new Error(`Failed to get computed styles: ${response.error.message}`)
    }

    const styles: { [key: string]: string } = {}
    for (const computedStyle of response.result.computedStyle) {
      styles[computedStyle.name] = computedStyle.value
    }

    return styles
  }

  async getBoundingBox(sessionId: string, nodeId: number): Promise<{
    x: number
    y: number
    width: number
    height: number
  } | null> {
    const request: CDPRequest = {
      id: 'getBoundingBox',
      method: 'DOM.getBoxModel',
      params: { nodeId }
    }

    const response = await this.cdpManager.executeCDPCommand(sessionId, request)
    
    if (response.error) {
      return null
    }

    const model = response.result.model
    return {
      x: model.content[0],
      y: model.content[1],
      width: model.content[2] - model.content[0],
      height: model.content[5] - model.content[1]
    }
  }

  async isElementVisible(sessionId: string, nodeId: number): Promise<boolean> {
    try {
      const boundingBox = await this.getBoundingBox(sessionId, nodeId)
      if (!boundingBox) {
        return false
      }

      const styles = await this.getComputedStyles(sessionId, nodeId)
      const display = styles.display || 'block'
      const visibility = styles.visibility || 'visible'
      const opacity = parseFloat(styles.opacity || '1')

      return (
        display !== 'none' &&
        visibility !== 'hidden' &&
        opacity > 0 &&
        boundingBox.width > 0 &&
        boundingBox.height > 0
      )
    } catch (error) {
      return false
    }
  }

  async inspectElement(sessionId: string, nodeId: number, options: DOMInspectionOptions = {}): Promise<DOMElement> {
    const element = await this.getNodeById(sessionId, nodeId)
    if (!element) {
      throw new Error('Element not found')
    }

    if (options.includeComputedStyles) {
      element.computedStyle = await this.getComputedStyles(sessionId, nodeId)
    }

    if (options.includeBoundingBox) {
      const boundingBox = await this.getBoundingBox(sessionId, nodeId)
      if (boundingBox) {
        element.boundingBox = boundingBox
      }
    }

    if (options.includeVisibility) {
      element.isVisible = await this.isElementVisible(sessionId, nodeId)
    }

    return element
  }

  async searchElements(sessionId: string, criteria: {
    tagName?: string
    className?: string
    id?: string
    attributes?: { [key: string]: string }
    textContent?: string
  }): Promise<DOMElement[]> {
    const document = await this.getDocument(sessionId)
    const results: DOMElement[] = []

    const searchRecursive = (element: DOMElement): void => {
      // Check tag name
      if (criteria.tagName && element.tagName !== criteria.tagName) {
        return
      }

      // Check class name
      if (criteria.className) {
        const classAttr = element.attributes.find(attr => attr.name === 'class')
        if (!classAttr || !classAttr.value.includes(criteria.className)) {
          return
        }
      }

      // Check ID
      if (criteria.id && element.id !== criteria.id) {
        return
      }

      // Check attributes
      if (criteria.attributes) {
        for (const [name, value] of Object.entries(criteria.attributes)) {
          const attr = element.attributes.find(attr => attr.name === name)
          if (!attr || attr.value !== value) {
            return
          }
        }
      }

      // Check text content
      if (criteria.textContent && !element.nodeValue.includes(criteria.textContent)) {
        return
      }

      results.push(element)

      // Search children
      if (element.children) {
        for (const child of element.children) {
          searchRecursive(child)
        }
      }
    }

    searchRecursive(document)
    return results
  }

  private processDOMNode(node: any): DOMElement {
    const element: DOMElement = {
      nodeId: node.nodeId,
      nodeType: node.nodeType,
      nodeName: node.nodeName,
      nodeValue: node.nodeValue || '',
      attributes: node.attributes || [],
      childNodeCount: node.childNodeCount || 0,
      children: node.children ? node.children.map((child: any) => this.processDOMNode(child)) : undefined
    }

    // Extract common properties
    if (node.nodeName && node.nodeName.includes('#')) {
      element.tagName = node.nodeName.split('#')[0]
    }

    const idAttr = element.attributes.find(attr => attr.name === 'id')
    if (idAttr) {
      element.id = idAttr.value
    }

    const classAttr = element.attributes.find(attr => attr.name === 'class')
    if (classAttr) {
      element.className = classAttr.value
    }

    return element
  }

  async getElementPath(sessionId: string, nodeId: number): Promise<string[]> {
    const path: string[] = []
    let currentNodeId = nodeId

    while (currentNodeId > 1) {
      const element = await this.getNodeById(sessionId, currentNodeId)
      if (!element) {
        break
      }

      let selector = element.tagName || element.nodeName
      
      if (element.id) {
        selector = `#${element.id}`
      } else if (element.className) {
        const classes = element.className.split(' ').filter(Boolean)
        if (classes.length > 0) {
          selector += `.${classes.join('.')}`
        }
      }

      path.unshift(selector)
      
      // Get parent
      const parentRequest: CDPRequest = {
        id: 'getParent',
        method: 'DOM.getParentNode',
        params: { nodeId: currentNodeId }
      }

      const response = await this.cdpManager.executeCDPCommand(sessionId, parentRequest)
      if (response.error || !response.result.nodeId) {
        break
      }

      currentNodeId = response.result.nodeId
    }

    return path
  }
} 