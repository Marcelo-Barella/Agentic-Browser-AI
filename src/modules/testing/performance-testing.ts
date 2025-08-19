export interface NetworkRequest {
  url: string
  method: string
  status: number
  durationMs: number
  sizeBytes: number
}

export interface PerformanceMetrics {
  loadTime: number
  firstContentfulPaint: number
  largestContentfulPaint: number
  timeToInteractive: number
  memoryUsage: number
  networkRequests: NetworkRequest[]
}

export interface UserAction {
  name: string
  script?: string
}

export interface BenchmarkResult {
  action: string
  durationMs: number
}

export interface PerformanceReport {
  runs: PerformanceMetrics[]
  summary: {
    averageLcp: number
    averageTti: number
    averageLoadTime: number
  }
}

export interface PerformanceTestResult {
  sessionId: string
  metrics: PerformanceMetrics
}

export class PerformanceTestingService {
  async measurePagePerformance(sessionId: string): Promise<PerformanceMetrics> {
    return {
      loadTime: 0,
      firstContentfulPaint: 0,
      largestContentfulPaint: 0,
      timeToInteractive: 0,
      memoryUsage: 0,
      networkRequests: []
    }
  }

  async benchmarkUserActions(sessionId: string, actions: UserAction[]): Promise<BenchmarkResult[]> {
    return actions.map(a => ({ action: a.name, durationMs: 0 }))
  }

  async generatePerformanceReport(metrics: PerformanceMetrics[]): Promise<PerformanceReport> {
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0)
    return {
      runs: metrics,
      summary: {
        averageLcp: avg(metrics.map(m => m.largestContentfulPaint)),
        averageTti: avg(metrics.map(m => m.timeToInteractive)),
        averageLoadTime: avg(metrics.map(m => m.loadTime))
      }
    }
  }
}


