import { TestCaseManager } from './test-case-manager.js'
import type { TestCase } from './test-case-manager.js'
import { TestSuiteManager } from './test-suite-manager.js'
import { TestReporter } from './test-reporter.js'
import type { TestReport } from './test-reporter.js'
import { ArtifactManager } from './artifact-manager.js'

export { TestCaseManager } from './test-case-manager.js'
export type { TestCase, TestStep, ExpectedResult, ValidationRule, BrowserRequirement } from './test-case-manager.js'
export { TestSuiteManager } from './test-suite-manager.js'
export type { TestSuite, TestHook } from './test-suite-manager.js'
export { VisualTestingService } from './visual-testing.js'
export type { VisualTestConfig, VisualComparisonResult, DiffReport, VisualTestResult } from './visual-testing.js'
export { PerformanceTestingService } from './performance-testing.js'
export type { PerformanceMetrics, NetworkRequest, UserAction, BenchmarkResult, PerformanceReport, PerformanceTestResult } from './performance-testing.js'
export { TestReporter } from './test-reporter.js'
export type { TestReport, TestSummary, VisualReport } from './test-reporter.js'
export { TestDataManager } from './test-data-manager.js'
export type { TestData, DataSchema } from './test-data-manager.js'
export { EnvironmentManager } from './environment-manager.js'
export type { TestEnvironment, EnvironmentConfig, BrowserConfig, ValidationResult } from './environment-manager.js'
export { ArtifactManager } from './artifact-manager.js'
export type { TestArtifact, RetentionPolicy, RecordingOptions, RecordingResult } from './artifact-manager.js'
export { GitHubActionsAdapter } from './ci-cd/github-actions-adapter.js'
export { JenkinsAdapter } from './ci-cd/jenkins-adapter.js'

export class TestingManager {
  private testCaseManager: TestCaseManager
  private testSuiteManager: TestSuiteManager
  private reporter: TestReporter
  private artifactManager: ArtifactManager

  constructor() {
    this.testCaseManager = new TestCaseManager()
    this.testSuiteManager = new TestSuiteManager()
    this.reporter = new TestReporter()
    this.artifactManager = new ArtifactManager()
  }

  async initialize(): Promise<void> {
    return
  }

  async createTestCase(input: Omit<TestCase, 'id'>): Promise<TestCase> {
    const created = await this.testCaseManager.create({ ...input })
    return created
  }

  async executeTestSuite(suiteId: string, environment: string, parallel: boolean): Promise<any> {
    const suite = await this.testSuiteManager.getById(suiteId)
    if (!suite) {
      throw new Error(`Test suite not found: ${suiteId}`)
    }
    return { suiteId: suite.id, environment, parallel, status: 'completed', results: [] }
  }

  async generateTestReport(testRunId: string, format: 'html' | 'json' | 'junit', includeArtifacts: boolean): Promise<string | object> {
    const report: TestReport = {
      id: testRunId,
      timestamp: new Date(),
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 },
      results: [],
      artifacts: [],
      performance: { runs: [], summary: { averageLcp: 0, averageTti: 0, averageLoadTime: 0 } },
      visual: { comparisons: [], summary: { total: 0, diffs: 0 } }
    }
    if (format === 'json') return report
    if (format === 'junit') return '<testsuite name="empty" tests="0" failures="0"></testsuite>'
    return '<html><body><h1>Empty Report</h1></body></html>'
  }
}


