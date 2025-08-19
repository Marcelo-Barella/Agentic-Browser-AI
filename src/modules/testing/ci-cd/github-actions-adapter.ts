import type { TestSuite } from '../test-suite-manager.js'

export class GitHubActionsAdapter {
  async generateWorkflow(testSuite: TestSuite): Promise<string> {
    return `name: Run Tests\n\non: [push]\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Setup Node\n        uses: actions/setup-node@v4\n        with:\n          node-version: '20'\n      - run: npm ci\n      - run: npm run build\n      - run: npm test`
  }

  async parseTestResults(artifactPath: string): Promise<Array<Record<string, any>>> {
    return []
  }
}


