export interface TestSummary {
  total: number
  passed: number
  failed: number
  skipped: number
  durationMs: number
}

export interface VisualReport {
  comparisons: Array<{ name: string; passed: boolean; diffPercentage?: number }>
  summary: { total: number; diffs: number }
}

export interface TestResult {
  id: string
  name: string
  status: 'passed' | 'failed' | 'skipped'
  durationMs: number
  error?: { message: string; stack?: string }
}

export interface PerformanceReport {
  runs: Array<Record<string, any>>
  summary: Record<string, number>
}

export interface TestArtifact {
  id: string
  type: 'screenshot' | 'video' | 'log' | 'report' | 'performance'
  path: string
  metadata: Record<string, any>
  retention: { policy: 'none' | 'days' | 'untildate'; value?: number | string }
}

export interface TestReport {
  id: string
  timestamp: Date
  summary: TestSummary
  results: TestResult[]
  artifacts: TestArtifact[]
  performance: PerformanceReport
  visual: VisualReport
}

export class TestReporter {
  async generateReport(testResults: TestResult[]): Promise<TestReport> {
    const total = testResults.length
    const passed = testResults.filter(r => r.status === 'passed').length
    const failed = testResults.filter(r => r.status === 'failed').length
    const skipped = testResults.filter(r => r.status === 'skipped').length
    const durationMs = testResults.reduce((sum, r) => sum + r.durationMs, 0)
    return {
      id: `tr_${Date.now()}`,
      timestamp: new Date(),
      summary: { total, passed, failed, skipped, durationMs },
      results: testResults,
      artifacts: [],
      performance: { runs: [], summary: {} },
      visual: { comparisons: [], summary: { total: 0, diffs: 0 } }
    }
  }

  async exportToJUnit(results: TestResult[]): Promise<string> {
    const tests = results.length
    const failures = results.filter(r => r.status === 'failed').length
    return `<testsuite name="suite" tests="${tests}" failures="${failures}">${results
      .map(r => `<testcase name="${r.name}" time="${(r.durationMs / 1000).toFixed(3)}">${r.status === 'failed' && r.error ? `<failure message="${r.error.message}"/>` : ''}</testcase>`) 
      .join('')}</testsuite>`
  }

  async exportToHTML(report: TestReport): Promise<string> {
    return `<html><body><h1>Test Report ${report.id}</h1><p>Total: ${report.summary.total}</p></body></html>`
  }

  async exportToJSON(report: TestReport): Promise<string> {
    return JSON.stringify(report)
  }
}


