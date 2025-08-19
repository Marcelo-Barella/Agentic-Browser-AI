export interface DataSchema {
  type: string
  fields: Array<{ name: string; type: string; required?: boolean }>
}

export interface TestData {
  id: string
  type: 'user' | 'product' | 'order' | 'custom'
  data: Record<string, any>
  lifecycle: 'static' | 'dynamic' | 'generated'
}

export class TestDataManager {
  async generateTestData(schema: DataSchema): Promise<TestData> {
    return { id: `td_${Date.now()}`, type: 'custom', data: {}, lifecycle: 'generated' }
  }

  async loadTestData(type: string): Promise<TestData[]> {
    return []
  }

  async cleanupTestData(testId: string): Promise<void> {
    return
  }
}


