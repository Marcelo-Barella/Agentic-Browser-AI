export interface BrowserRequirement {
  browser: 'chromium' | 'chrome' | 'firefox' | 'webkit'
  version?: string
  platform?: 'windows' | 'macos' | 'linux'
  headless?: boolean
}

export interface ValidationRule {
  rule: string
  params?: Record<string, any>
}

export interface ExpectedResult {
  description: string
  selector?: string
  value?: any
}

export interface TestStep {
  id: string
  action: 'navigate' | 'click' | 'fill' | 'wait' | 'assert' | 'screenshot' | 'custom'
  selector?: string
  value?: any
  options?: Record<string, any>
  validation?: ValidationRule[]
}

export interface TestCase {
  id: string
  name: string
  description: string
  type: 'unit' | 'integration' | 'e2e' | 'visual' | 'performance'
  priority: 'low' | 'medium' | 'high' | 'critical'
  browserRequirements: BrowserRequirement[]
  testSteps: TestStep[]
  expectedResults: ExpectedResult[]
  timeout: number
  retries: number
  tags: string[]
}

export class TestCaseManager {
  private cases: Map<string, TestCase> = new Map()

  async create(input: Omit<TestCase, 'id'>): Promise<TestCase> {
    const id = `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const created: TestCase = { id, ...input }
    this.cases.set(id, created)
    return created
  }

  async getById(id: string): Promise<TestCase | undefined> {
    return this.cases.get(id)
  }

  async list(): Promise<TestCase[]> {
    return Array.from(this.cases.values())
  }
}


