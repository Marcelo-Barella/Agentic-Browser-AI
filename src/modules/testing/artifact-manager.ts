export type RetentionPolicy = { policy: 'none' } | { policy: 'days'; value: number } | { policy: 'untildate'; value: string }

export interface TestArtifact {
  id: string
  type: 'screenshot' | 'video' | 'log' | 'report' | 'performance'
  path: string
  metadata: Record<string, any>
  retention: RetentionPolicy
}

export interface RecordingOptions {
  withVideo?: boolean
  withNetwork?: boolean
}

export interface RecordingResult {
  sessionId: string
  startedAt: number
  stoppedAt: number
  artifacts: TestArtifact[]
}

export class ArtifactManager {
  private store: Map<string, TestArtifact> = new Map()

  async storeArtifact(artifact: TestArtifact): Promise<string> {
    this.store.set(artifact.id, artifact)
    return artifact.id
  }

  async retrieveArtifact(artifactId: string): Promise<TestArtifact> {
    const a = this.store.get(artifactId)
    if (!a) throw new Error(`Artifact not found: ${artifactId}`)
    return a
  }

  async cleanupExpiredArtifacts(): Promise<void> {
    return
  }
}


