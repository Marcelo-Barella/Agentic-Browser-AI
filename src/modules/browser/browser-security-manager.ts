import { EventEmitter } from 'events'

export interface SecurityPolicy {
  allowedDomains: string[]
  blockedDomains: string[]
  allowedProtocols: string[]
  maxRedirects: number
  timeout: number
  sandbox: boolean
  disableImages: boolean
  disableJavaScript: boolean
  disablePlugins: boolean
  userAgent: string
}

export interface SecurityValidation {
  isValid: boolean
  reason?: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  warnings: string[]
}

export interface ContentSecurityPolicy {
  defaultSrc: string[]
  scriptSrc: string[]
  styleSrc: string[]
  imgSrc: string[]
  connectSrc: string[]
  fontSrc: string[]
  objectSrc: string[]
  mediaSrc: string[]
  frameSrc: string[]
}

export class BrowserSecurityManager extends EventEmitter {
  private policy: SecurityPolicy
  private csp: ContentSecurityPolicy
  private blockedUrls: Set<string> = new Set()
  private allowedUrls: Set<string> = new Set()
  private isInitialized: boolean = false

  constructor(policy?: Partial<SecurityPolicy>) {
    super()
    
    this.policy = {
      allowedDomains: ['localhost', '127.0.0.1', '0.0.0.0'],
      blockedDomains: ['malware.example.com', 'phishing.example.com'],
      allowedProtocols: ['http:', 'https:', 'data:'],
      maxRedirects: 5,
      timeout: 30000,
      sandbox: true,
      disableImages: false,
      disableJavaScript: false,
      disablePlugins: true,
      userAgent: 'AgenticAI-Browser/1.0',
      ...policy
    }

    this.csp = {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      // Initialize security measures
      await this.setupSecurityPolicies()
      this.isInitialized = true
      this.emit('initialized')
    } catch (error) {
      throw new Error(`Failed to initialize Browser Security Manager: ${error}`)
    }
  }

  async validateUrl(url: string): Promise<SecurityValidation> {
    const validation: SecurityValidation = {
      isValid: true,
      riskLevel: 'low',
      warnings: []
    }

    try {
      const urlObj = new URL(url)
      
      // Check protocol
      if (!this.policy.allowedProtocols.includes(urlObj.protocol)) {
        validation.isValid = false
        validation.reason = `Protocol ${urlObj.protocol} is not allowed`
        validation.riskLevel = 'high'
        return validation
      }

      // Check domain (skip for data URLs)
      const domain = urlObj.hostname.toLowerCase()
      
      // Skip domain validation for data URLs
      if (urlObj.protocol === 'data:') {
        // Data URLs are allowed if protocol is allowed
        return validation
      }
      
      // Check blocked domains
      if (this.policy.blockedDomains.some(blocked => domain.includes(blocked))) {
        validation.isValid = false
        validation.reason = `Domain ${domain} is blocked`
        validation.riskLevel = 'critical'
        return validation
      }

      // Check allowed domains (if specified)
      if (this.policy.allowedDomains.length > 0) {
        const isAllowed = this.policy.allowedDomains.some(allowed => 
          domain === allowed || domain.endsWith(`.${allowed}`)
        )
        if (!isAllowed) {
          validation.isValid = false
          validation.reason = `Domain ${domain} is not in allowed list`
          validation.riskLevel = 'high'
          return validation
        }
      }

      // Check for suspicious patterns
      if (this.detectSuspiciousPatterns(url)) {
        validation.warnings.push('URL contains suspicious patterns')
        validation.riskLevel = 'medium'
      }

      // Check for IP addresses
      if (this.isIPAddress(domain)) {
        validation.warnings.push('URL uses IP address instead of domain name')
        validation.riskLevel = 'medium'
      }

      // Check for excessive redirects
      if (url.includes('redirect') || url.includes('goto')) {
        validation.warnings.push('URL may contain redirects')
        validation.riskLevel = 'medium'
      }

    } catch (error) {
      validation.isValid = false
      validation.reason = `Invalid URL format: ${error}`
      validation.riskLevel = 'high'
    }

    return validation
  }

  async validateContent(content: string): Promise<SecurityValidation> {
    const validation: SecurityValidation = {
      isValid: true,
      riskLevel: 'low',
      warnings: []
    }

    // Check for XSS patterns
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
      /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi
    ]

    for (const pattern of xssPatterns) {
      if (pattern.test(content)) {
        validation.isValid = false
        validation.reason = 'Content contains potentially malicious code'
        validation.riskLevel = 'critical'
        return validation
      }
    }

    // Check for suspicious JavaScript
    const jsPatterns = [
      /eval\s*\(/gi,
      /Function\s*\(/gi,
      /setTimeout\s*\(/gi,
      /setInterval\s*\(/gi,
      /document\.write/gi,
      /innerHTML\s*=/gi,
      /outerHTML\s*=/gi
    ]

    for (const pattern of jsPatterns) {
      if (pattern.test(content)) {
        validation.warnings.push('Content contains potentially dangerous JavaScript')
        validation.riskLevel = 'medium'
      }
    }

    return validation
  }

  getSecurityHeaders(): { [key: string]: string } {
    return {
      'Content-Security-Policy': this.generateCSPHeader(),
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    }
  }

  getBrowserArgs(): string[] {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]

    if (this.policy.disableImages) {
      args.push('--disable-images')
    }

    if (this.policy.disableJavaScript) {
      args.push('--disable-javascript')
    }

    if (this.policy.disablePlugins) {
      args.push('--disable-plugins')
    }

    if (this.policy.sandbox) {
      args.push('--disable-extensions')
      args.push('--disable-plugins-discovery')
    }

    return args
  }

  addBlockedUrl(url: string): void {
    this.blockedUrls.add(url.toLowerCase())
    this.emit('urlBlocked', url)
  }

  removeBlockedUrl(url: string): void {
    this.blockedUrls.delete(url.toLowerCase())
    this.emit('urlUnblocked', url)
  }

  addAllowedUrl(url: string): void {
    this.allowedUrls.add(url.toLowerCase())
    this.emit('urlAllowed', url)
  }

  removeAllowedUrl(url: string): void {
    this.allowedUrls.delete(url.toLowerCase())
    this.emit('urlDisallowed', url)
  }

  isUrlBlocked(url: string): boolean {
    return this.blockedUrls.has(url.toLowerCase())
  }

  isUrlAllowed(url: string): boolean {
    if (this.allowedUrls.size === 0) {
      return true // If no specific allowed URLs, all are allowed (subject to domain policy)
    }
    return this.allowedUrls.has(url.toLowerCase())
  }

  updateSecurityPolicy(policy: Partial<SecurityPolicy>): void {
    this.policy = { ...this.policy, ...policy }
    this.emit('policyUpdated', this.policy)
  }

  updateCSP(csp: Partial<ContentSecurityPolicy>): void {
    this.csp = { ...this.csp, ...csp }
    this.emit('cspUpdated', this.csp)
  }

  getSecurityPolicy(): SecurityPolicy {
    return { ...this.policy }
  }

  getCSP(): ContentSecurityPolicy {
    return { ...this.csp }
  }

  private async setupSecurityPolicies(): Promise<void> {
    // Initialize default security measures
    this.emit('securityPoliciesSetup')
  }

  private generateCSPHeader(): string {
    const directives = []
    
    for (const [directive, sources] of Object.entries(this.csp)) {
      if (sources.length > 0) {
        directives.push(`${directive} ${sources.join(' ')}`)
      }
    }

    return directives.join('; ')
  }

  private detectSuspiciousPatterns(url: string): boolean {
    const suspiciousPatterns = [
      /[<>]/g, // HTML tags
      /javascript:/gi,
      /data:text\/html/gi,
      /vbscript:/gi,
      /on\w+\s*=/gi,
      /<script/gi,
      /<iframe/gi,
      /<object/gi,
      /<embed/gi
    ]

    return suspiciousPatterns.some(pattern => pattern.test(url))
  }

  private isIPAddress(domain: string): boolean {
    const ipPattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
    return ipPattern.test(domain)
  }

  isReady(): boolean {
    return this.isInitialized
  }

  async shutdown(): Promise<void> {
    this.isInitialized = false
    this.blockedUrls.clear()
    this.allowedUrls.clear()
    this.emit('shutdown')
  }
} 