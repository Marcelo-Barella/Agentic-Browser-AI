import { DOMInspector, DOMElement } from './dom-inspector.js'

export interface VueComponent {
  name: string
  type: 'vue2' | 'vue3' | 'unknown'
  props: { [key: string]: any }
  data: { [key: string]: any }
  computed: string[]
  methods: string[]
  events: string[]
  template: string
  parent?: string
  children: string[]
  nodeId: number
  selector: string
  isRoot: boolean
  isDynamic: boolean
  isAsync: boolean
}

export interface VueComponentMapping {
  components: VueComponent[]
  rootComponents: VueComponent[]
  componentTree: { [componentName: string]: VueComponent }
  mappingStats: {
    totalComponents: number
    vue2Components: number
    vue3Components: number
    dynamicComponents: number
    asyncComponents: number
  }
}

export interface VueMappingOptions {
  includeProps?: boolean
  includeData?: boolean
  includeComputed?: boolean
  includeMethods?: boolean
  includeEvents?: boolean
  includeTemplate?: boolean
  maxDepth?: number
  filterComponents?: string[]
}

export class VueComponentMapper {
  private domInspector: DOMInspector
  private vue2Patterns: RegExp[]
  private vue3Patterns: RegExp[]
  private componentCache: Map<number, VueComponent> = new Map()

  constructor(domInspector: DOMInspector) {
    this.domInspector = domInspector
    
    // Vue 2 patterns
    this.vue2Patterns = [
      /^v-[\w-]+$/, // v-if, v-for, v-model, etc.
      /^@[\w-]+$/, // @click, @input, etc.
      /^:[\w-]+$/, // :class, :style, etc.
      /^\[data-v-[\w-]+\]$/, // scoped styles
      /^__vue__$/, // Vue 2 internal property
    ]

    // Vue 3 patterns
    this.vue3Patterns = [
      /^v-[\w-]+$/, // v-if, v-for, v-model, etc.
      /^@[\w-]+$/, // @click, @input, etc.
      /^:[\w-]+$/, // :class, :style, etc.
      /^\[data-v-[\w-]+\]$/, // scoped styles
      /^__vnode__$/, // Vue 3 internal property
      /^__vueParentComponent__$/, // Vue 3 parent component
    ]
  }

  async mapVueComponents(sessionId: string, options: VueMappingOptions = {}): Promise<VueComponentMapping> {
    const document = await this.domInspector.getDocument(sessionId)
    const components: VueComponent[] = []
    const componentTree: { [componentName: string]: VueComponent } = {}

    // Find all potential Vue components
    const vueElements = await this.findVueElements(sessionId, document)
    
    for (const element of vueElements) {
      const component = await this.analyzeVueComponent(sessionId, element, options)
      if (component) {
        components.push(component)
        componentTree[component.name] = component
      }
    }

    // Build component relationships
    const rootComponents = components.filter(comp => comp.isRoot)
    
    // Calculate mapping statistics
    const mappingStats = this.calculateMappingStats(components)

    return {
      components,
      rootComponents,
      componentTree,
      mappingStats
    }
  }

  async findVueElements(sessionId: string, document: DOMElement): Promise<DOMElement[]> {
    const vueElements: DOMElement[] = []

    const searchRecursive = (element: DOMElement): void => {
      if (this.isVueElement(element)) {
        vueElements.push(element)
      }

      if (element.children) {
        for (const child of element.children) {
          searchRecursive(child)
        }
      }
    }

    searchRecursive(document)
    return vueElements
  }

  private isVueElement(element: DOMElement): boolean {
    // Check for Vue-specific attributes
    for (const attr of element.attributes) {
      const attrName = attr.name.toLowerCase()
      
      // Check Vue 2 patterns
      for (const pattern of this.vue2Patterns) {
        if (pattern.test(attrName)) {
          return true
        }
      }

      // Check Vue 3 patterns
      for (const pattern of this.vue3Patterns) {
        if (pattern.test(attrName)) {
          return true
        }
      }
    }

    // Check for Vue-specific classes
    if (element.className) {
      const classes = element.className.split(' ')
      for (const className of classes) {
        if (className.includes('vue') || className.includes('v-')) {
          return true
        }
      }
    }

    return false
  }

  async analyzeVueComponent(sessionId: string, element: DOMElement, options: VueMappingOptions = {}): Promise<VueComponent | null> {
    // Check cache first
    if (this.componentCache.has(element.nodeId)) {
      return this.componentCache.get(element.nodeId)!
    }

    const componentName = this.extractComponentName(element)
    if (!componentName) {
      return null
    }

    const vueType = this.determineVueType(element)
    const selector = await this.domInspector.getElementPath(sessionId, element.nodeId)
    
    const component: VueComponent = {
      name: componentName,
      type: vueType,
      props: options.includeProps ? await this.extractProps(sessionId, element) : {},
      data: options.includeData ? await this.extractData(sessionId, element) : {},
      computed: options.includeComputed ? await this.extractComputed(sessionId, element) : [],
      methods: options.includeMethods ? await this.extractMethods(sessionId, element) : [],
      events: options.includeEvents ? await this.extractEvents(sessionId, element) : [],
      template: options.includeTemplate ? await this.extractTemplate(sessionId, element) : '',
      children: [],
      nodeId: element.nodeId,
      selector: selector.join(' > '),
      isRoot: this.isRootComponent(element),
      isDynamic: this.isDynamicComponent(element),
      isAsync: this.isAsyncComponent(element)
    }

    // Cache the component
    this.componentCache.set(element.nodeId, component)

    return component
  }

  private extractComponentName(element: DOMElement): string | null {
    // Try to extract from data attributes
    const dataComponent = element.attributes.find(attr => 
      attr.name === 'data-component' || attr.name === 'data-vue-component'
    )
    if (dataComponent) {
      return dataComponent.value
    }

    // Try to extract from class names
    if (element.className) {
      const classes = element.className.split(' ')
      for (const className of classes) {
        if (className.includes('component') || className.includes('vue')) {
          return className.replace(/[^a-zA-Z0-9]/g, '')
        }
      }
    }

    // Try to extract from tag name (custom elements)
    if (element.tagName && element.tagName.includes('-')) {
      return element.tagName
    }

    // Fallback to a generated name
    return `VueComponent_${element.nodeId}`
  }

  private determineVueType(element: DOMElement): 'vue2' | 'vue3' | 'unknown' {
    // Check for Vue 3 composition API patterns
    const hasCompositionAPI = element.attributes.some(attr => 
      attr.name.startsWith('data-v-') && attr.value && attr.value.includes('composition')
    )

    // Check for Vue 2 patterns using attributes
    const hasVue2Patterns = element.attributes.some(attr => 
      this.vue2Patterns.some(pattern => pattern.test(attr.name) || (attr.value && pattern.test(attr.value)))
    )

    // Check for Vue 3 patterns using attributes
    const hasVue3Patterns = element.attributes.some(attr => 
      this.vue3Patterns.some(pattern => pattern.test(attr.name) || (attr.value && pattern.test(attr.value)))
    )

    if (hasCompositionAPI || hasVue3Patterns) {
      return 'vue3'
    } else if (hasVue2Patterns) {
      return 'vue2'
    }

    return 'unknown'
  }

  private async extractProps(sessionId: string, element: DOMElement): Promise<{ [key: string]: any }> {
    const props: { [key: string]: any } = {}

    // Extract props from attributes
    for (const attr of element.attributes) {
      if (attr.name.startsWith('data-prop-')) {
        const propName = attr.name.replace('data-prop-', '')
        if (attr.value) {
          try {
            props[propName] = JSON.parse(attr.value)
          } catch {
            props[propName] = attr.value
          }
        }
      }
    }

    return props
  }

  private async extractData(sessionId: string, element: DOMElement): Promise<{ [key: string]: any }> {
    const data: { [key: string]: any } = {}

    // Extract data from data attributes
    for (const attr of element.attributes) {
      if (attr.name.startsWith('data-') && !attr.name.startsWith('data-prop-')) {
        const dataAttr = attr
        if (dataAttr.value) {
          try {
            Object.assign(data, JSON.parse(dataAttr.value))
          } catch {
            // Ignore parsing errors
          }
        }
      }
    }

    return data
  }

  private async extractComputed(sessionId: string, element: DOMElement): Promise<string[]> {
    const computed: string[] = []

    // Look for computed properties in the DOM
    try {
      const computedElements = await this.domInspector.querySelectorAll(sessionId, '[data-computed]')
      for (const computedElement of computedElements) {
        const computedName = computedElement.attributes.find(attr => attr.name === 'data-computed')?.value
        if (computedName) {
          computed.push(computedName)
        }
      }
    } catch {
      // Ignore extraction errors
    }

    return computed
  }

  private async extractMethods(sessionId: string, element: DOMElement): Promise<string[]> {
    const methods: string[] = []

    // Extract methods from event handlers
    for (const attr of element.attributes) {
      if (attr.name.startsWith('@') || attr.name.startsWith('v-on:')) {
        const attrValue = attr.value
        if (attrValue && typeof attrValue === 'string' && attrValue.length > 0) {
          const parts = attrValue.split('(')
          const firstPart = parts[0]
          if (firstPart) {
            const methodName = firstPart.trim()
            if (methodName && !methods.includes(methodName)) {
              methods.push(methodName)
            }
          }
        }
      }
    }

    return methods
  }

  private async extractEvents(sessionId: string, element: DOMElement): Promise<string[]> {
    const events: string[] = []

    // Extract events from attributes
    for (const attr of element.attributes) {
      if (attr.name.startsWith('@') || attr.name.startsWith('v-on:')) {
        const eventName = attr.name.replace(/^(@|v-on:)/, '')
        if (eventName && !events.includes(eventName)) {
          events.push(eventName)
        }
      }
    }

    return events
  }

  private async extractTemplate(sessionId: string, element: DOMElement): Promise<string> {
    // Extract the template by getting the inner HTML
    try {
      const templateElement = await this.domInspector.querySelector(sessionId, `[data-template="${element.nodeId}"]`)
      if (templateElement) {
        return templateElement.nodeValue || ''
      }
    } catch {
      // Ignore extraction errors
    }

    return ''
  }

  private isRootComponent(element: DOMElement): boolean {
    // Check if this is a root Vue component
    return element.attributes.some(attr => 
      attr.name === 'id' && attr.value && (attr.value === 'app' || attr.value.includes('root'))
    )
  }

  private isDynamicComponent(element: DOMElement): boolean {
    // Check for dynamic component patterns
    return element.attributes.some(attr => 
      attr.name === 'is' || attr.name === 'component' || (attr.value && attr.value.includes('component'))
    )
  }

  private isAsyncComponent(element: DOMElement): boolean {
    // Check for async component patterns
    return element.attributes.some(attr => 
      attr.name.includes('async') || attr.name.includes('lazy')
    )
  }

  private calculateMappingStats(components: VueComponent[]): VueComponentMapping['mappingStats'] {
    return {
      totalComponents: components.length,
      vue2Components: components.filter(c => c.type === 'vue2').length,
      vue3Components: components.filter(c => c.type === 'vue3').length,
      dynamicComponents: components.filter(c => c.isDynamic).length,
      asyncComponents: components.filter(c => c.isAsync).length
    }
  }

  async getComponentByName(sessionId: string, componentName: string): Promise<VueComponent | null> {
    const mapping = await this.mapVueComponents(sessionId)
    return mapping.componentTree[componentName] || null
  }

  async getComponentHierarchy(sessionId: string): Promise<{ [componentName: string]: string[] }> {
    const mapping = await this.mapVueComponents(sessionId)
    const hierarchy: { [componentName: string]: string[] } = {}

    for (const component of mapping.components) {
      hierarchy[component.name] = component.children
    }

    return hierarchy
  }

  clearCache(): void {
    this.componentCache.clear()
  }
} 