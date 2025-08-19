export class JenkinsAdapter {
  async generatePipeline(): Promise<string> {
    return `pipeline { agent any stages { stage('Build') { steps { sh 'npm ci' ; sh 'npm run build' } } stage('Test') { steps { sh 'npm test' } } } }`
  }

  async triggerBuild(jobName: string): Promise<{ jobName: string; status: string }> {
    return { jobName, status: 'queued' }
  }
}


