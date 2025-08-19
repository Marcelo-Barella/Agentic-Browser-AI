import type { TestCase } from './test-case-manager.js'
import type { TestEnvironment } from './environment-manager.js'

export interface TestHook {
  name: string
  type: 'beforeAll' | 'afterAll' | 'beforeEach' | 'afterEach'
  script?: string
}

export interface TestSuite {
  id: string
  name: string
  description: string
  testCases: TestCase[]
  environment: TestEnvironment
  parallelExecution: boolean
  maxConcurrency: number
  setupHooks: TestHook[]
  teardownHooks: TestHook[]
}

export class TestSuiteManager {
  private suites: Map<string, TestSuite> = new Map()

  async create(input: Omit<TestSuite, 'id'>): Promise<TestSuite> {
    const id = `ts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const suite: TestSuite = { id, ...input }
    this.suites.set(id, suite)
    return suite
  }

  async getById(id: string): Promise<TestSuite | undefined> {
    return this.suites.get(id)
  }

  async list(): Promise<TestSuite[]> {
    return Array.from(this.suites.values())
  }
}


