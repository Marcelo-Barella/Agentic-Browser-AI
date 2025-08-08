import { DOMInspector, DOMElement } from './dom-inspector.js'
import { JavaScriptExecutor } from './js-executor.js'

export interface ElementContext {
  nearText?: string
  withinSection?: 'form' | 'nav' | 'main' | 'footer' | 'header'
  ariaRole?: string
  attributes?: Record<string, string>
}

export interface SelectorStrategy {
  type: 'semantic' | 'structural' | 'attribute' | 'xpath' | 'ai_enhanced'
  selector: string
  confidence: number
  fallback: boolean
  dynamic: boolean
}

export interface DynamicStrategy {
  waitStrategy: string
  retryStrategy: string
  fallbackStrategy: string
}

export interface ConfidenceScore {
  score: number
  reasons: string[]
}

export interface PageSemanticMap {
  regions: Array<{
    type: 'form' | 'nav' | 'main' | 'footer' | 'header' | 'aside' | 'unknown'
    nodeId: number
    selector: string
    elements: number
  }>
  summary: {
    totalElements: number
    forms: number
    buttons: number
    inputs: number
    links: number
  }
}

export interface ElementMatch {
  nodeId: number
  selector: string
  selectors: SelectorStrategy[]
  confidence: number
  alternatives: Array<{
    nodeId: number
    selector: string
    confidence: number
  }>
}

export interface AIElementSelector {
  findElementByDescription(sessionId: string, description: string, context?: ElementContext): Promise<ElementMatch>
  generateRobustSelectors(sessionId: string, element: DOMElement): Promise<SelectorStrategy[]>
  analyzePageSemantics(sessionId: string): Promise<PageSemanticMap>
  handleDynamicElements(sessionId: string, element: DOMElement): Promise<DynamicStrategy>
  scoreElementMatch(sessionId: string, element: DOMElement, description: string): Promise<ConfidenceScore>
}

class SemanticAnalyzer {
  constructor(private domInspector: DOMInspector) {}

  async analyzePageSemantics(sessionId: string): Promise<PageSemanticMap> {
    const doc = await this.domInspector.getDocument(sessionId)
    const regions: PageSemanticMap['regions'] = []
    const counters = { total: 0, forms: 0, buttons: 0, inputs: 0, links: 0 }

    const walk = (el: DOMElement, path: string[]): void => {
      counters.total += 1
      const tag = (el.tagName || '').toLowerCase()
      const role = this.getAttr(el, 'role')
      if (tag === 'form') counters.forms += 1
      if (tag === 'button' || this.getAttr(el, 'type') === 'submit') counters.buttons += 1
      if (tag === 'input' || tag === 'textarea' || tag === 'select') counters.inputs += 1
      if (tag === 'a') counters.links += 1

      const sectionType = this.classifyRegion(tag, role)
      if (sectionType !== 'unknown') {
        regions.push({
          type: sectionType,
          nodeId: el.nodeId,
          selector: this.selectorFrom(el, path),
          elements: el.childNodeCount || 0
        })
      }

      if (el.children) {
        for (const child of el.children) {
          walk(child, [...path, this.segmentFrom(child)])
        }
      }
    }

    walk(doc, [this.segmentFrom(doc)])

    return {
      regions,
      summary: {
        totalElements: counters.total,
        forms: counters.forms,
        buttons: counters.buttons,
        inputs: counters.inputs,
        links: counters.links
      }
    }
  }

  private getAttr(el: DOMElement, name: string): string | undefined {
    const a = el.attributes.find(a => a.name === name)
    return a?.value
  }

  private classifyRegion(tag: string, role?: string): PageSemanticMap['regions'][number]['type'] {
    if (role === 'navigation' || tag === 'nav') return 'nav'
    if (tag === 'header') return 'header'
    if (tag === 'footer') return 'footer'
    if (tag === 'main') return 'main'
    if (tag === 'aside') return 'aside'
    if (tag === 'form') return 'form'
    return 'unknown'
  }

  private segmentFrom(el: DOMElement): string {
    const tag = (el.tagName || el.nodeName || 'node').toLowerCase()
    const id = el.id ? `#${el.id}` : ''
    const cls = el.className ? `.${el.className.split(' ').filter(Boolean).join('.')}` : ''
    return `${tag}${id}${cls}`
  }

  private selectorFrom(el: DOMElement, path: string[]): string {
    if (el.id) return `#${el.id}`
    return path.slice(-3).join(' > ')
  }
}

class ElementClassifier {
  classify(el: DOMElement): 'button' | 'input' | 'link' | 'image' | 'label' | 'text' | 'container' {
    const tag = (el.tagName || '').toLowerCase()
    if (tag === 'button') return 'button'
    if (tag === 'a') return 'link'
    if (tag === 'img') return 'image'
    if (tag === 'label') return 'label'
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'input'
    if (el.childNodeCount && el.childNodeCount > 0) return 'container'
    return 'text'
  }
}

class SelectorGenerator {
  constructor(private domInspector: DOMInspector) {}

  async generate(sessionId: string, element: DOMElement): Promise<SelectorStrategy[]> {
    const strategies: SelectorStrategy[] = []
    const tag = (element.tagName || '').toLowerCase()
    const id = element.id
    const className = element.className
    const ariaLabel = this.getAttr(element, 'aria-label')
    const dataTestId = this.getAttr(element, 'data-testid') || this.getAttr(element, 'data-test-id')

    if (id) {
      strategies.push({ type: 'attribute', selector: `#${id}`, confidence: 0.98, fallback: false, dynamic: false })
    }
    if (className) {
      const cls = className.split(' ').filter(Boolean).slice(0, 3).join('.')
      if (cls) strategies.push({ type: 'attribute', selector: `${tag}.${cls}`.trim(), confidence: 0.7, fallback: true, dynamic: true })
    }
    if (ariaLabel) {
      strategies.push({ type: 'semantic', selector: `[aria-label="${this.escapeCss(ariaLabel)}"]`, confidence: 0.85, fallback: true, dynamic: false })
    }
    if (dataTestId) {
      strategies.push({ type: 'attribute', selector: `[data-testid="${this.escapeCss(dataTestId)}"]`, confidence: 0.95, fallback: false, dynamic: false })
    }

    const structural = await this.buildStructuralSelector(sessionId, element)
    if (structural) strategies.push({ type: 'structural', selector: structural, confidence: 0.8, fallback: true, dynamic: true })

    const xpath = this.buildXPath(element)
    strategies.push({ type: 'xpath', selector: xpath, confidence: 0.6, fallback: true, dynamic: true })

    const ai = await this.generateAIEnhanced(element)
    strategies.push(ai)

    return this.deduplicate(strategies)
  }

  private async buildStructuralSelector(sessionId: string, element: DOMElement): Promise<string | null> {
    const path = await this.domInspector.getElementPath(sessionId, element.nodeId)
    return path && path.length > 0 ? path.join(' > ') : null
  }

  private buildXPath(element: DOMElement): string {
    const parts: string[] = []
    const build = (el: DOMElement | undefined): void => {
      if (!el) return
      const tag = (el.tagName || 'node').toLowerCase()
      if (el.id) {
        parts.unshift(`//*[@id='${this.escapeXpath(el.id)}']`)
        return
      }
      let segment = `/${tag}`
      if (el.className) {
        const cls = el.className.split(' ').filter(Boolean)[0]
        if (cls) segment += `[contains(@class,'${this.escapeXpath(cls)}')]`
      }
      parts.unshift(segment)
    }
    build(element)
    return parts.join('') || '//*'
  }

  private async generateAIEnhanced(element: DOMElement): Promise<SelectorStrategy> {
    const tag = (element.tagName || '').toLowerCase()
    const semanticHints: string[] = []
    const role = this.getAttr(element, 'role')
    if (role) semanticHints.push(`[role="${this.escapeCss(role)}"]`)
    const name = this.getAttr(element, 'name')
    if (name) semanticHints.push(`[name="${this.escapeCss(name)}"]`)
    const type = this.getAttr(element, 'type')
    if (type) semanticHints.push(`[type="${this.escapeCss(type)}"]`)
    const combined = [tag, ...semanticHints].join('')
    return { type: 'ai_enhanced', selector: combined || tag || '*', confidence: 0.95, fallback: false, dynamic: false }
  }

  private getAttr(el: DOMElement, name: string): string | undefined {
    const a = el.attributes.find(a => a.name === name)
    return a?.value
  }

  private escapeCss(s: string): string {
    return s.replace(/(["\\:\.\#\[\]\(\)])/g, '\\$1')
  }

  private escapeXpath(s: string): string {
    return s.replace(/'/g, "&apos;")
  }

  private deduplicate(list: SelectorStrategy[]): SelectorStrategy[] {
    const seen = new Set<string>()
    const out: SelectorStrategy[] = []
    for (const s of list) {
      const key = `${s.type}:${s.selector}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push(s)
      }
    }
    return out
  }
}

class DynamicElementHandler {
  async handle(element: DOMElement): Promise<DynamicStrategy> {
    const waitStrategy = 'visible: wait up to 10s for element to be attached, visible, and enabled'
    const retryStrategy = 'retry: up to 3 times with 500ms backoff on interaction failures'
    const fallbackStrategy = 'fallback: use attribute or xpath selector if semantic/structural fails'
    return { waitStrategy, retryStrategy, fallbackStrategy }
  }
}

export class AIElementSelectorImpl implements AIElementSelector {
  private semanticAnalyzer: SemanticAnalyzer
  private elementClassifier: ElementClassifier
  private selectorGenerator: SelectorGenerator
  private dynamicHandler: DynamicElementHandler

  constructor(private domInspector: DOMInspector, private jsExecutor: JavaScriptExecutor) {
    this.semanticAnalyzer = new SemanticAnalyzer(domInspector)
    this.elementClassifier = new ElementClassifier()
    this.selectorGenerator = new SelectorGenerator(domInspector)
    this.dynamicHandler = new DynamicElementHandler()
  }

  async findElementByDescription(sessionId: string, description: string, context?: ElementContext): Promise<ElementMatch> {
    const intent = this.parseIntent(description)
    const doc = await this.domInspector.getDocument(sessionId)
    const candidates = this.collectCandidates(doc)
    const scored: Array<{ el: DOMElement; score: number; selector: string }> = []

    for (const el of candidates) {
      const score = await this.computeScore(sessionId, el, intent, context)
      if (score.score > 0) {
        const sel = await this.primarySelector(sessionId, el)
        scored.push({ el, score: score.score, selector: sel })
      }
    }

    scored.sort((a, b) => b.score - a.score)
    const best = scored[0]
    if (!best) {
      throw new Error('No matching element found')
    }

    const selectors = await this.generateRobustSelectors(sessionId, best.el)
    const alternatives = scored.slice(1, 3).map(s => ({ nodeId: s.el.nodeId, selector: s.selector, confidence: s.score }))

    return {
      nodeId: best.el.nodeId,
      selector: best.selector,
      selectors,
      confidence: Math.min(1, best.score),
      alternatives
    }
  }

  async generateRobustSelectors(sessionId: string, element: DOMElement): Promise<SelectorStrategy[]> {
    return await this.selectorGenerator.generate(sessionId, element)
  }

  async analyzePageSemantics(sessionId: string): Promise<PageSemanticMap> {
    return this.semanticAnalyzer.analyzePageSemantics(sessionId)
  }

  async handleDynamicElements(sessionId: string, element: DOMElement): Promise<DynamicStrategy> {
    return this.dynamicHandler.handle(element)
  }

  async scoreElementMatch(sessionId: string, element: DOMElement, description: string): Promise<ConfidenceScore> {
    const intent = this.parseIntent(description)
    return this.computeScore(sessionId, element, intent)
  }

  private parseIntent(description: string): { action?: 'click' | 'fill' | 'select'; keywords: string[]; preferredRole?: string } {
    const text = description.toLowerCase()
    const action: 'click' | 'fill' | 'select' | undefined =
      text.includes('click') || text.includes('press') ? 'click'
      : (text.includes('fill') || text.includes('type')) ? 'fill'
      : (text.includes('select') ? 'select' : undefined)
    const payload: { action?: 'click' | 'fill' | 'select'; keywords: string[]; preferredRole?: string } = {
      keywords: Array.from(new Set(text.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)))
    }
    if (action) payload.action = action
    if (payload.keywords.includes('button')) payload.preferredRole = 'button'
    if (payload.keywords.includes('link')) payload.preferredRole = 'link'
    if (payload.keywords.includes('input') || payload.keywords.includes('field')) payload.preferredRole = 'input'
    return payload
  }

  private collectCandidates(root: DOMElement): DOMElement[] {
    const out: DOMElement[] = []
    const stack: DOMElement[] = [root]
    while (stack.length) {
      const el = stack.pop()!
      out.push(el)
      if (el.children) for (const c of el.children) stack.push(c)
    }
    return out
  }

  private async computeScore(sessionId: string, el: DOMElement, intent: { action?: string; keywords: string[]; preferredRole?: string }, context?: ElementContext): Promise<ConfidenceScore> {
    const reasons: string[] = []
    let score = 0

    const tag = (el.tagName || '').toLowerCase()
    const role = this.getAttr(el, 'role')
    const type = this.getAttr(el, 'type')
    const ariaLabel = this.getAttr(el, 'aria-label')
    const name = this.getAttr(el, 'name')
    const id = el.id
    const cls = el.className

    if (intent.preferredRole === 'button' && (tag === 'button' || type === 'submit' || role === 'button')) { score += 0.4; reasons.push('button-like') }
    if (intent.preferredRole === 'input' && (tag === 'input' || tag === 'textarea' || tag === 'select')) { score += 0.35; reasons.push('input-like') }
    if (intent.preferredRole === 'link' && tag === 'a') { score += 0.3; reasons.push('link-like') }

    const textHints = [ariaLabel, name, id, cls].filter(Boolean).join(' ').toLowerCase()
    for (const kw of intent.keywords) {
      if (!kw) continue
      const weight = kw.length >= 4 ? 0.08 : 0.04
      if (textHints.includes(kw)) { score += weight; reasons.push(`match:${kw}`) }
    }

    const visible = await this.isVisible(sessionId, el)
    if (visible) { score += 0.1; reasons.push('visible') }

    if (context?.ariaRole && role === context.ariaRole) { score += 0.1; reasons.push('role-context') }
    if (context?.attributes) {
      for (const [k, v] of Object.entries(context.attributes)) {
        const val = this.getAttr(el, k)
        if (val && (!v || val === v)) { score += 0.05; reasons.push(`attr:${k}`) }
      }
    }

    return { score: Math.min(score, 1), reasons }
  }

  private async primarySelector(sessionId: string, el: DOMElement): Promise<string> {
    if (el.id) return `#${el.id}`
    const path = await this.domInspector.getElementPath(sessionId, el.nodeId)
    return path && path.length ? path.join(' > ') : (el.tagName || '*').toLowerCase()
  }

  private getAttr(el: DOMElement, name: string): string | undefined {
    const a = el.attributes.find(a => a.name === name)
    return a?.value
  }

  private async isVisible(sessionId: string, el: DOMElement): Promise<boolean> {
    try {
      return await this.domInspector.isElementVisible(sessionId, el.nodeId)
    } catch {
      return false
    }
  }
}


