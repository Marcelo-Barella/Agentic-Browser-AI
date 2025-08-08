import { EventEmitter } from 'events'
import { getLogger } from '../../core/logger.js'
import { ErrorHandler } from '../../core/error-handler.js'
import { CDPConnectionManager } from './cdp-connection-manager.js'

export interface Cookie {
  name: string
  value: string
  domain?: string
  path?: string
  expires?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
}

export interface StorageItem {
  key: string
  value: string
  timestamp: Date
}

export interface BrowserSession {
  sessionId: string
  cookies: Cookie[]
  localStorage: StorageItem[]
  sessionStorage: StorageItem[]
  credentials: Credential[]
  createdAt: Date
  lastActivity: Date
}

export interface Credential {
  type: 'username' | 'password' | 'token' | 'api_key'
  key: string
  value: string
  encrypted: boolean
  domain?: string
  expiresAt?: Date
}

export interface SessionState {
  url: string
  title: string
  viewport: {
    width: number
    height: number
  }
  scrollPosition: {
    x: number
    y: number
  }
  formData: Record<string, string>
  timestamp: Date
}

export class StateManager extends EventEmitter {
  private cdpManager: CDPConnectionManager
  private logger: any
  private errorHandler: ErrorHandler
  private sessions: Map<string, BrowserSession> = new Map()
  private sessionStates: Map<string, SessionState> = new Map()
  private isInitialized: boolean = false

  constructor(cdpManager: CDPConnectionManager) {
    super()
    this.cdpManager = cdpManager
    this.logger = getLogger()
    this.errorHandler = new ErrorHandler()
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      await this.errorHandler.initialize()
      this.isInitialized = true
      this.emit('initialized')
      
      this.logger.info('State Manager initialized successfully', {
        module: 'StateManager',
        operation: 'initialize'
      })
    } catch (error) {
      this.logger.error('Failed to initialize State Manager', {
        module: 'StateManager',
        operation: 'initialize',
        error: error instanceof Error ? error : new Error(String(error))
      })
      throw new Error(`State Manager initialization failed: ${error}`)
    }
  }

  async createSession(sessionId: string): Promise<BrowserSession> {
    if (!this.isInitialized) {
      throw new Error('State Manager not initialized')
    }

    try {
      const session: BrowserSession = {
        sessionId,
        cookies: [],
        localStorage: [],
        sessionStorage: [],
        credentials: [],
        createdAt: new Date(),
        lastActivity: new Date()
      }

      this.sessions.set(sessionId, session)
      
      this.logger.info('Browser session created', {
        module: 'StateManager',
        operation: 'createSession',
        data: { sessionId }
      })
      
      this.emit('sessionCreated', sessionId, session)
      return session
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'StateManager',
          operation: 'createSession',
          sessionId
        },
        'medium'
      )
      throw error
    }
  }

  async getCookies(sessionId: string, domain?: string): Promise<Cookie[]> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      const cookies = await connection.page.cookies(domain || '')
      
      const session = this.sessions.get(sessionId)
      if (session) {
        session.cookies = cookies
        session.lastActivity = new Date()
      }

      this.logger.debug('Cookies retrieved', {
        module: 'StateManager',
        operation: 'getCookies',
        data: { sessionId, domain, cookieCount: cookies.length }
      })

      return cookies
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'StateManager',
          operation: 'getCookies',
          sessionId,
          parameters: { domain }
        },
        'low'
      )
      throw error
    }
  }

  async setCookie(sessionId: string, cookie: Cookie): Promise<void> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      await connection.page.setCookie(cookie)
      
      const session = this.sessions.get(sessionId)
      if (session) {
        const existingIndex = session.cookies.findIndex(c => c.name === cookie.name)
        if (existingIndex >= 0) {
          session.cookies[existingIndex] = cookie
        } else {
          session.cookies.push(cookie)
        }
        session.lastActivity = new Date()
      }

      this.logger.info('Cookie set successfully', {
        module: 'StateManager',
        operation: 'setCookie',
        data: { sessionId, cookieName: cookie.name, domain: cookie.domain }
      })

      this.emit('cookieSet', sessionId, cookie)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'StateManager',
          operation: 'setCookie',
          sessionId,
          parameters: { cookie: { name: cookie.name, domain: cookie.domain } }
        },
        'medium'
      )
      throw error
    }
  }

  async deleteCookie(sessionId: string, name: string, domain?: string): Promise<void> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      await connection.page.deleteCookie({ name, ...(domain && { domain }) })
      
      const session = this.sessions.get(sessionId)
      if (session) {
        session.cookies = session.cookies.filter(c => !(c.name === name && (!domain || c.domain === domain)))
        session.lastActivity = new Date()
      }

      this.logger.info('Cookie deleted successfully', {
        module: 'StateManager',
        operation: 'deleteCookie',
        data: { sessionId, cookieName: name, domain }
      })

      this.emit('cookieDeleted', sessionId, name, domain)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'StateManager',
          operation: 'deleteCookie',
          sessionId,
          parameters: { name, domain }
        },
        'medium'
      )
      throw error
    }
  }

  async getLocalStorage(sessionId: string): Promise<StorageItem[]> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      const items = await connection.page.evaluate(() => {
        try {
          const storage: StorageItem[] = []
          const localStorage = (globalThis as any).localStorage
          
          if (!localStorage) {
            return []
          }
          
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key) {
              storage.push({
                key,
                value: localStorage.getItem(key) || '',
                timestamp: new Date()
              })
            }
          }
          return storage
        } catch (error) {
          // Return empty array if localStorage access is denied
          return []
        }
      })

      const session = this.sessions.get(sessionId)
      if (session) {
        session.localStorage = items
        session.lastActivity = new Date()
      }

      this.logger.debug('Local storage retrieved', {
        module: 'StateManager',
        operation: 'getLocalStorage',
        data: { sessionId, itemCount: items.length }
      })

      return items
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'StateManager',
          operation: 'getLocalStorage',
          sessionId
        },
        'low'
      )
      throw error
    }
  }

  async setLocalStorageItem(sessionId: string, key: string, value: string): Promise<void> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      await connection.page.evaluate((key, value) => {
        try {
          const localStorage = (globalThis as any).localStorage
          if (localStorage) {
            localStorage.setItem(key, value)
          }
        } catch (error) {
          // Ignore localStorage access errors
        }
      }, key, value)

      const session = this.sessions.get(sessionId)
      if (session) {
        const existingIndex = session.localStorage.findIndex(item => item.key === key)
        const newItem: StorageItem = { key, value, timestamp: new Date() }
        
        if (existingIndex >= 0) {
          session.localStorage[existingIndex] = newItem
        } else {
          session.localStorage.push(newItem)
        }
        session.lastActivity = new Date()
      }

      this.logger.info('Local storage item set', {
        module: 'StateManager',
        operation: 'setLocalStorageItem',
        data: { sessionId, key, valueLength: value.length }
      })

      this.emit('localStorageItemSet', sessionId, key, value)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'StateManager',
          operation: 'setLocalStorageItem',
          sessionId,
          parameters: { key, valueLength: value.length }
        },
        'medium'
      )
      throw error
    }
  }

  async getSessionStorage(sessionId: string): Promise<StorageItem[]> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      const items = await connection.page.evaluate(() => {
        const storage: StorageItem[] = []
        for (let i = 0; i < (globalThis as any).sessionStorage?.length || 0; i++) {
          const key = (globalThis as any).sessionStorage?.key(i)
          if (key) {
            storage.push({
              key,
              value: (globalThis as any).sessionStorage?.getItem(key) || '',
              timestamp: new Date()
            })
          }
        }
        return storage
      })

      const session = this.sessions.get(sessionId)
      if (session) {
        session.sessionStorage = items
        session.lastActivity = new Date()
      }

      this.logger.debug('Session storage retrieved', {
        module: 'StateManager',
        operation: 'getSessionStorage',
        data: { sessionId, itemCount: items.length }
      })

      return items
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'StateManager',
          operation: 'getSessionStorage',
          sessionId
        },
        'low'
      )
      throw error
    }
  }

  async setSessionStorageItem(sessionId: string, key: string, value: string): Promise<void> {
    try {
      const connection = await this.cdpManager.getConnection(sessionId)
      if (!connection) {
        throw new Error('Connection not found')
      }

      await connection.page.evaluate((key, value) => {
        (globalThis as any).sessionStorage?.setItem(key, value)
      }, key, value)

      const session = this.sessions.get(sessionId)
      if (session) {
        const existingIndex = session.sessionStorage.findIndex(item => item.key === key)
        const newItem: StorageItem = { key, value, timestamp: new Date() }
        
        if (existingIndex >= 0) {
          session.sessionStorage[existingIndex] = newItem
        } else {
          session.sessionStorage.push(newItem)
        }
        session.lastActivity = new Date()
      }

      this.logger.info('Session storage item set', {
        module: 'StateManager',
        operation: 'setSessionStorageItem',
        data: { sessionId, key, valueLength: value.length }
      })

      this.emit('sessionStorageItemSet', sessionId, key, value)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'StateManager',
          operation: 'setSessionStorageItem',
          sessionId,
          parameters: { key, valueLength: value.length }
        },
        'medium'
      )
      throw error
    }
  }

  async saveCredential(sessionId: string, credential: Credential): Promise<void> {
    try {
      const session = this.sessions.get(sessionId)
      if (!session) {
        throw new Error('Session not found')
      }

      const existingIndex = session.credentials.findIndex(c => c.key === credential.key)
      if (existingIndex >= 0) {
        session.credentials[existingIndex] = credential
      } else {
        session.credentials.push(credential)
      }
      session.lastActivity = new Date()

      this.logger.info('Credential saved', {
        module: 'StateManager',
        operation: 'saveCredential',
        data: { sessionId, credentialType: credential.type, key: credential.key }
      })

      this.emit('credentialSaved', sessionId, credential)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'StateManager',
          operation: 'saveCredential',
          sessionId,
          parameters: { credentialType: credential.type, key: credential.key }
        },
        'high'
      )
      throw error
    }
  }

  async getCredentials(sessionId: string, type?: string): Promise<Credential[]> {
    try {
      const session = this.sessions.get(sessionId)
      if (!session) {
        return []
      }

      const credentials = type 
        ? session.credentials.filter(c => c.type === type)
        : session.credentials

      this.logger.debug('Credentials retrieved', {
        module: 'StateManager',
        operation: 'getCredentials',
        data: { sessionId, type, credentialCount: credentials.length }
      })

      return credentials
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'StateManager',
          operation: 'getCredentials',
          sessionId,
          parameters: { type }
        },
        'low'
      )
      throw error
    }
  }

  async saveSessionState(sessionId: string, state: SessionState): Promise<void> {
    try {
      this.sessionStates.set(sessionId, state)
      
      this.logger.info('Session state saved', {
        module: 'StateManager',
        operation: 'saveSessionState',
        data: { sessionId, url: state.url, title: state.title }
      })

      this.emit('sessionStateSaved', sessionId, state)
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'StateManager',
          operation: 'saveSessionState',
          sessionId,
          parameters: { url: state.url }
        },
        'medium'
      )
      throw error
    }
  }

  async restoreSessionState(sessionId: string): Promise<SessionState | null> {
    try {
      const state = this.sessionStates.get(sessionId)
      
      if (state) {
        this.logger.info('Session state restored', {
          module: 'StateManager',
          operation: 'restoreSessionState',
          data: { sessionId, url: state.url, title: state.title }
        })

        this.emit('sessionStateRestored', sessionId, state)
      }

      return state || null
    } catch (error) {
      await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'StateManager',
          operation: 'restoreSessionState',
          sessionId
        },
        'low'
      )
      throw error
    }
  }

  getSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId)
  }

  getAllSessions(): BrowserSession[] {
    return Array.from(this.sessions.values())
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId)
    this.sessionStates.delete(sessionId)
    
    this.logger.info('Session cleared', {
      module: 'StateManager',
      operation: 'clearSession',
      data: { sessionId }
    })

    this.emit('sessionCleared', sessionId)
  }

  clearAllSessions(): void {
    this.sessions.clear()
    this.sessionStates.clear()
    
    this.logger.info('All sessions cleared', {
      module: 'StateManager',
      operation: 'clearAllSessions'
    })

    this.emit('allSessionsCleared')
  }

  isReady(): boolean {
    return this.isInitialized
  }

  async shutdown(): Promise<void> {
    this.sessions.clear()
    this.sessionStates.clear()
    this.isInitialized = false
    this.emit('shutdown')
  }
}
