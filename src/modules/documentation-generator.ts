import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { EventEmitter } from 'events'

/**
 * Documentation Generator Module
 * Generates comprehensive Markdown documentation for the agentic AI system
 * Tracks changes, decisions, and system activities
 */

export interface DocumentationEntry {
  id: string
  timestamp: Date
  type: 'task' | 'decision' | 'change' | 'error' | 'info'
  title: string
  description: string
  details?: Record<string, any>
  tags: string[]
  author?: string
  priority: 'low' | 'medium' | 'high' | 'critical'
}

export interface TaskReport {
  taskId: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  startTime: Date
  endTime?: Date
  duration?: number
  steps: TaskStep[]
  errors: string[]
  warnings: string[]
  results: Record<string, any>
}

export interface TaskStep {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  startTime: Date
  endTime?: Date
  duration?: number
  details?: Record<string, any>
}

export interface ChangeLog {
  version: string
  date: Date
  changes: Change[]
  author: string
  description: string
}

export interface Change {
  type: 'added' | 'modified' | 'removed' | 'fixed' | 'deprecated'
  component: string
  description: string
  details?: string
  breaking?: boolean
}

export interface Decision {
  id: string
  title: string
  description: string
  context: string
  alternatives: string[]
  rationale: string
  consequences: string[]
  timestamp: Date
  author: string
  status: 'proposed' | 'approved' | 'rejected' | 'implemented'
}

export interface APIReference {
  name: string
  description: string
  endpoints: APIEndpoint[]
  models: APIModel[]
  examples: APIExample[]
}

export interface APIEndpoint {
  method: string
  path: string
  description: string
  parameters: APIParameter[]
  responses: APIResponse[]
  examples: APIExample[]
}

export interface APIParameter {
  name: string
  type: string
  required: boolean
  description: string
  defaultValue?: any
}

export interface APIResponse {
  code: number
  description: string
  schema?: Record<string, any>
}

export interface APIModel {
  name: string
  description: string
  properties: Record<string, any>
  examples: any[]
}

export interface APIExample {
  title: string
  description: string
  request?: Record<string, any>
  response?: Record<string, any>
  code?: string
}

export class DocumentationGenerator extends EventEmitter {
  private entries: DocumentationEntry[] = []
  private tasks: Map<string, TaskReport> = new Map()
  private decisions: Decision[] = []
  private changes: ChangeLog[] = []
  private apiReferences: APIReference[] = []
  private outputDirectory: string

  constructor(outputDirectory: string = './docs') {
    super()
    this.outputDirectory = outputDirectory
    this.ensureOutputDirectory()
  }

  /**
   * Generate comprehensive task report
   */
  async generateTaskReport(task: TaskReport): Promise<string> {
    const markdown = `# Task Report: ${task.title}

## Overview
- **Task ID**: ${task.taskId}
- **Status**: ${task.status}
- **Start Time**: ${task.startTime.toISOString()}
- **End Time**: ${task.endTime?.toISOString() || 'In Progress'}
- **Duration**: ${task.duration ? `${task.duration}ms` : 'N/A'}

## Description
${task.description}

## Steps
${task.steps.map(step => this.generateStepMarkdown(step)).join('\n\n')}

## Results
${this.generateResultsMarkdown(task.results)}

## Errors
${task.errors.length > 0 ? task.errors.map(error => `- ${error}`).join('\n') : 'No errors'}

## Warnings
${task.warnings.length > 0 ? task.warnings.map(warning => `- ${warning}`).join('\n') : 'No warnings'}

---
*Generated on ${new Date().toISOString()}*
`

    await this.writeDocument('tasks', `${task.taskId}.md`, markdown)
    return markdown
  }

  /**
   * Generate change log
   */
  async generateChangeLog(changes: Change[]): Promise<string> {
    const changeLog: ChangeLog = {
      version: this.generateVersion(),
      date: new Date(),
      changes,
      author: 'Agentic AI System',
      description: 'Automated change log generation'
    }

    const markdown = `# Change Log v${changeLog.version}

**Date**: ${changeLog.date.toISOString()}
**Author**: ${changeLog.author}
**Description**: ${changeLog.description}

## Changes

${changes.map(change => this.generateChangeMarkdown(change)).join('\n\n')}

---
*Generated on ${new Date().toISOString()}*
`

    await this.writeDocument('changelogs', `v${changeLog.version}.md`, markdown)
    this.changes.push(changeLog)
    return markdown
  }

  /**
   * Generate decision documentation
   */
  async generateDecisionDocument(decisions: Decision[]): Promise<string> {
    const markdown = `# Decision Log

## Overview
This document tracks important decisions made during the development of the agentic AI system.

## Decisions

${decisions.map(decision => this.generateDecisionMarkdown(decision)).join('\n\n---\n\n')}

---
*Generated on ${new Date().toISOString()}*
`

    await this.writeDocument('decisions', 'decision-log.md', markdown)
    this.decisions.push(...decisions)
    return markdown
  }

  /**
   * Generate API reference documentation
   */
  async generateAPIReference(api: APIReference): Promise<string> {
    const markdown = `# API Reference: ${api.name}

## Overview
${api.description}

## Endpoints

${api.endpoints.map(endpoint => this.generateEndpointMarkdown(endpoint)).join('\n\n')}

## Models

${api.models.map(model => this.generateModelMarkdown(model)).join('\n\n')}

## Examples

${api.examples.map(example => this.generateExampleMarkdown(example)).join('\n\n')}

---
*Generated on ${new Date().toISOString()}*
`

    await this.writeDocument('api', `${api.name.toLowerCase().replace(/\s+/g, '-')}.md`, markdown)
    this.apiReferences.push(api)
    return markdown
  }

  /**
   * Add documentation entry
   */
  addEntry(entry: DocumentationEntry): void {
    this.entries.push(entry)
    this.emit('entryAdded', entry)
  }

  /**
   * Add task report
   */
  addTaskReport(task: TaskReport): void {
    this.tasks.set(task.taskId, task)
    this.generateTaskReport(task)
  }

  /**
   * Add decision
   */
  addDecision(decision: Decision): void {
    this.decisions.push(decision)
    this.generateDecisionDocument([decision])
  }

  /**
   * Add change
   */
  addChange(change: Change): void {
    const changeLog: ChangeLog = {
      version: this.generateVersion(),
      date: new Date(),
      changes: [change],
      author: 'Agentic AI System',
      description: 'Single change log entry'
    }
    
    this.changes.push(changeLog)
    this.generateChangeLog([change])
  }

  /**
   * Generate system status report
   */
  async generateSystemStatusReport(): Promise<string> {
    const stats = this.getStatistics()
    
    const markdown = `# System Status Report

## Overview
- **Total Entries**: ${stats.totalEntries}
- **Active Tasks**: ${stats.activeTasks}
- **Total Decisions**: ${stats.totalDecisions}
- **Total Changes**: ${stats.totalChanges}
- **API References**: ${stats.apiReferences}

## Recent Activity
${this.entries.slice(-10).map(entry => this.generateEntryMarkdown(entry)).join('\n\n')}

## Task Summary
${Array.from(this.tasks.values()).map(task => `- ${task.title} (${task.status})`).join('\n')}

## Recent Decisions
${this.decisions.slice(-5).map(decision => `- ${decision.title} (${decision.status})`).join('\n')}

---
*Generated on ${new Date().toISOString()}*
`

    await this.writeDocument('reports', 'system-status.md', markdown)
    return markdown
  }

  /**
   * Generate step markdown
   */
  private generateStepMarkdown(step: TaskStep): string {
    return `### ${step.title}
- **Status**: ${step.status}
- **Duration**: ${step.duration ? `${step.duration}ms` : 'N/A'}
- **Description**: ${step.description}
${step.details ? `- **Details**: ${JSON.stringify(step.details, null, 2)}` : ''}`
  }

  /**
   * Generate results markdown
   */
  private generateResultsMarkdown(results: Record<string, any>): string {
    if (Object.keys(results).length === 0) {
      return 'No results available'
    }

    return Object.entries(results).map(([key, value]) => {
      return `### ${key}
\`\`\`json
${JSON.stringify(value, null, 2)}
\`\`\``
    }).join('\n\n')
  }

  /**
   * Generate change markdown
   */
  private generateChangeMarkdown(change: Change): string {
    const typeEmoji = {
      added: '➕',
      modified: '🔄',
      removed: '➖',
      fixed: '🐛',
      deprecated: '⚠️'
    }[change.type]

    return `${typeEmoji} **${change.type.toUpperCase()}** - ${change.component}
${change.description}
${change.details ? `\n\`\`\`\n${change.details}\n\`\`\`` : ''}
${change.breaking ? '⚠️ **BREAKING CHANGE**' : ''}`
  }

  /**
   * Generate decision markdown
   */
  private generateDecisionMarkdown(decision: Decision): string {
    return `## ${decision.title}

**ID**: ${decision.id}
**Status**: ${decision.status}
**Author**: ${decision.author}
**Date**: ${decision.timestamp.toISOString()}

### Context
${decision.context}

### Description
${decision.description}

### Alternatives Considered
${decision.alternatives.map(alt => `- ${alt}`).join('\n')}

### Rationale
${decision.rationale}

### Consequences
${decision.consequences.map(consequence => `- ${consequence}`).join('\n')}`
  }

  /**
   * Generate endpoint markdown
   */
  private generateEndpointMarkdown(endpoint: APIEndpoint): string {
    return `### ${endpoint.method.toUpperCase()} ${endpoint.path}

${endpoint.description}

#### Parameters
${endpoint.parameters.map(param => `- \`${param.name}\` (${param.type})${param.required ? ' **required**' : ''} - ${param.description}`).join('\n')}

#### Responses
${endpoint.responses.map(response => `- \`${response.code}\` - ${response.description}`).join('\n')}

#### Examples
${endpoint.examples.map(example => this.generateExampleMarkdown(example)).join('\n\n')}`
  }

  /**
   * Generate model markdown
   */
  private generateModelMarkdown(model: APIModel): string {
    return `### ${model.name}

${model.description}

#### Properties
\`\`\`json
${JSON.stringify(model.properties, null, 2)}
\`\`\`

#### Examples
${model.examples.map(example => `\`\`\`json\n${JSON.stringify(example, null, 2)}\n\`\`\``).join('\n\n')}`
  }

  /**
   * Generate example markdown
   */
  private generateExampleMarkdown(example: APIExample): string {
    let markdown = `#### ${example.title}

${example.description}`

    if (example.request) {
      markdown += `\n\n**Request:**
\`\`\`json
${JSON.stringify(example.request, null, 2)}
\`\`\``
    }

    if (example.response) {
      markdown += `\n\n**Response:**
\`\`\`json
${JSON.stringify(example.response, null, 2)}
\`\`\``
    }

    if (example.code) {
      markdown += `\n\n**Code:**
\`\`\`
${example.code}
\`\`\``
    }

    return markdown
  }

  /**
   * Generate entry markdown
   */
  private generateEntryMarkdown(entry: DocumentationEntry): string {
    const typeEmoji = {
      task: '📋',
      decision: '🤔',
      change: '🔄',
      error: '❌',
      info: 'ℹ️'
    }[entry.type]

    return `${typeEmoji} **${entry.title}** (${entry.type})
- **Date**: ${entry.timestamp.toISOString()}
- **Priority**: ${entry.priority}
- **Tags**: ${entry.tags.join(', ')}
- **Description**: ${entry.description}
${entry.details ? `- **Details**: ${JSON.stringify(entry.details, null, 2)}` : ''}`
  }

  /**
   * Write document to file
   */
  private async writeDocument(category: string, filename: string, content: string): Promise<void> {
    const categoryDir = join(this.outputDirectory, category)
    if (!existsSync(categoryDir)) {
      mkdirSync(categoryDir, { recursive: true })
    }

    const filePath = join(categoryDir, filename)
    writeFileSync(filePath, content, 'utf-8')
  }

  /**
   * Ensure output directory exists
   */
  private ensureOutputDirectory(): void {
    if (!existsSync(this.outputDirectory)) {
      mkdirSync(this.outputDirectory, { recursive: true })
    }
  }

  /**
   * Generate version string
   */
  private generateVersion(): string {
    const now = new Date()
    return `${now.getFullYear()}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getDate().toString().padStart(2, '0')}`
  }

  /**
   * Get system statistics
   */
  private getStatistics(): {
    totalEntries: number
    activeTasks: number
    totalDecisions: number
    totalChanges: number
    apiReferences: number
  } {
    return {
      totalEntries: this.entries.length,
      activeTasks: Array.from(this.tasks.values()).filter(task => task.status === 'in_progress').length,
      totalDecisions: this.decisions.length,
      totalChanges: this.changes.length,
      apiReferences: this.apiReferences.length
    }
  }

  /**
   * Get all entries
   */
  getEntries(): DocumentationEntry[] {
    return [...this.entries]
  }

  /**
   * Get all tasks
   */
  getTasks(): TaskReport[] {
    return Array.from(this.tasks.values())
  }

  /**
   * Get all decisions
   */
  getDecisions(): Decision[] {
    return [...this.decisions]
  }

  /**
   * Get all changes
   */
  getChanges(): ChangeLog[] {
    return [...this.changes]
  }

  /**
   * Get all API references
   */
  getAPIReferences(): APIReference[] {
    return [...this.apiReferences]
  }

  /**
   * Clear all documentation
   */
  clear(): void {
    this.entries = []
    this.tasks.clear()
    this.decisions = []
    this.changes = []
    this.apiReferences = []
  }
} 