/**
 * Task Planner - Phase 3 Component
 * Analyzes development requirements and creates comprehensive execution plans
 * Integrates with existing ProjectAnalyzer and BrowserManager
 */

// Removed project analyzer per cleanup plan
import { BrowserManager } from '../browser/browser-manager.js'
import { ErrorHandler } from '../../core/error-handler.js'

export interface TaskRequirement {
  id: string
  title: string
  description: string
  type: 'development' | 'testing' | 'deployment' | 'analysis'
  priority: 'low' | 'medium' | 'high' | 'critical'
  estimatedDuration: number // in minutes
  dependencies: string[]
  resources: string[]
  constraints: Record<string, any>
}

export interface ExecutionPlan {
  id: string
  requirementId: string
  steps: ExecutionStep[]
  estimatedTotalDuration: number
  dependencies: string[]
  riskLevel: 'low' | 'medium' | 'high'
  fallbackStrategies: string[]
  createdAt: Date
  updatedAt: Date
}

export interface ExecutionStep {
  id: string
  title: string
  description: string
  type: 'code_analysis' | 'browser_testing' | 'file_operation' | 'api_call' | 'custom'
  order: number
  estimatedDuration: number
  dependencies: string[]
  parameters: Record<string, any>
  validationRules: Record<string, any>
}

export interface TaskContext {
  projectPath: string
  currentBranch: string
  availableResources: string[]
  constraints: Record<string, any>
  environment: 'development' | 'staging' | 'production'
}

export class TaskPlanner {
  private projectAnalyzer: any | null = null
  private browserManager: BrowserManager
  private errorHandler: ErrorHandler
  private isInitialized = false

  constructor() {
    this.browserManager = new BrowserManager()
    this.errorHandler = new ErrorHandler()
  }

  /**
   * Initialize the task planner
   */
  async initialize(): Promise<void> {
    try {
      await this.errorHandler.initialize()
      await this.browserManager.initialize()
      this.isInitialized = true
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'TaskPlanner',
          operation: 'initialize'
        },
        'critical'
      )
      throw error
    }
  }

  /**
   * Analyze a development requirement and create an execution plan
   */
  async createExecutionPlan(
    requirement: TaskRequirement,
    context: TaskContext
  ): Promise<ExecutionPlan> {
    try {
      if (!this.isInitialized) {
        throw new Error('TaskPlanner not initialized')
      }

      // Initialize project analyzer if needed
      // ProjectAnalyzer removed

      // Analyze the requirement
      const analysis = await this.analyzeRequirement(requirement, context)

      // Create execution steps
      const steps = await this.createExecutionSteps(requirement, analysis, context)

      // Calculate dependencies and order
      const orderedSteps = this.orderStepsByDependencies(steps)

      // Calculate total duration
      const totalDuration = orderedSteps.reduce((sum, step) => sum + step.estimatedDuration, 0)

      // Assess risk level
      const riskLevel = this.assessRiskLevel(requirement, orderedSteps, context)

      // Create fallback strategies
      const fallbackStrategies = this.createFallbackStrategies(requirement, orderedSteps)

      const plan: ExecutionPlan = {
        id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        requirementId: requirement.id,
        steps: orderedSteps,
        estimatedTotalDuration: totalDuration,
        dependencies: requirement.dependencies,
        riskLevel,
        fallbackStrategies,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      return plan
    } catch (error) {
      await this.errorHandler.handleError(
        error as Error,
        {
          module: 'TaskPlanner',
          operation: 'createExecutionPlan',
          parameters: {
            requirementId: requirement.id
          }
        },
        'high'
      )
      throw error
    }
  }

  /**
   * Analyze a requirement to understand its scope and complexity
   */
  private async analyzeRequirement(
    requirement: TaskRequirement,
    context: TaskContext
  ): Promise<Record<string, any>> {
    const analysis: Record<string, any> = {
      complexity: 'low',
      codeImpact: [],
      browserRequirements: [],
      fileOperations: [],
      apiCalls: [],
      estimatedSteps: 0
    }

    // Analyze based on requirement type
    switch (requirement.type) {
      case 'development':
        analysis.complexity = this.assessDevelopmentComplexity(requirement)
        analysis.codeImpact = await this.analyzeCodeImpact(requirement, context)
        analysis.estimatedSteps = this.estimateDevelopmentSteps(requirement)
        break

      case 'testing':
        analysis.complexity = this.assessTestingComplexity(requirement)
        analysis.browserRequirements = await this.analyzeBrowserRequirements(requirement)
        analysis.estimatedSteps = this.estimateTestingSteps(requirement)
        break

      case 'deployment':
        analysis.complexity = this.assessDeploymentComplexity(requirement)
        analysis.fileOperations = await this.analyzeFileOperations(requirement, context)
        analysis.estimatedSteps = this.estimateDeploymentSteps(requirement)
        break

      case 'analysis':
        analysis.complexity = this.assessAnalysisComplexity(requirement)
        analysis.codeImpact = await this.analyzeCodeImpact(requirement, context)
        analysis.estimatedSteps = this.estimateAnalysisSteps(requirement)
        break
    }

    return analysis
  }

  /**
   * Create execution steps based on requirement analysis
   */
  private async createExecutionSteps(
    requirement: TaskRequirement,
    analysis: Record<string, any>,
    context: TaskContext
  ): Promise<ExecutionStep[]> {
    const steps: ExecutionStep[] = []

    // Add initial validation step
    steps.push({
      id: `step_validation_${Date.now()}`,
      title: 'Validate Requirements',
      description: 'Validate all requirements and constraints',
      type: 'custom',
      order: 1,
      estimatedDuration: 2,
      dependencies: [],
      parameters: {
        requirement,
        context,
        analysis
      },
      validationRules: {
        requiredFields: ['title', 'description', 'type', 'priority'],
        constraintValidation: true
      }
    })

    // Add type-specific steps
    switch (requirement.type) {
      case 'development':
        steps.push(...await this.createDevelopmentSteps(requirement, analysis, context))
        break
      case 'testing':
        steps.push(...await this.createTestingSteps(requirement, analysis, context))
        break
      case 'deployment':
        steps.push(...await this.createDeploymentSteps(requirement, analysis, context))
        break
      case 'analysis':
        steps.push(...await this.createAnalysisSteps(requirement, analysis, context))
        break
    }

    // Add final validation step
    steps.push({
      id: `step_final_validation_${Date.now()}`,
      title: 'Final Validation',
      description: 'Validate task completion and quality',
      type: 'custom',
      order: steps.length + 1,
      estimatedDuration: 3,
      dependencies: steps.map(step => step.id),
      parameters: {
        requirement,
        context
      },
      validationRules: {
        qualityCheck: true,
        completionValidation: true
      }
    })

    return steps
  }

  /**
   * Create development-specific execution steps
   */
  private async createDevelopmentSteps(
    requirement: TaskRequirement,
    analysis: Record<string, any>,
    context: TaskContext
  ): Promise<ExecutionStep[]> {
    const steps: ExecutionStep[] = []

    // Code analysis step
    if (analysis.codeImpact.length > 0) {
      steps.push({
        id: `step_code_analysis_${Date.now()}`,
        title: 'Analyze Code Impact',
        description: 'Analyze existing code structure and impact',
        type: 'code_analysis',
        order: 2,
        estimatedDuration: 5,
        dependencies: ['step_validation_1'],
        parameters: {
          projectPath: context.projectPath,
          files: analysis.codeImpact,
          analysisType: 'impact'
        },
        validationRules: {
          fileExists: true,
          syntaxValid: true
        }
      })
    }

    // File operations
    steps.push({
      id: `step_file_operations_${Date.now()}`,
      title: 'Perform File Operations',
      description: 'Create, modify, or delete files as required',
      type: 'file_operation',
      order: 3,
      estimatedDuration: 10,
      dependencies: ['step_code_analysis_1'],
      parameters: {
        projectPath: context.projectPath,
        operations: analysis.fileOperations || []
      },
      validationRules: {
        backupRequired: true,
        permissionCheck: true
      }
    })

    return steps
  }

  /**
   * Create testing-specific execution steps
   */
  private async createTestingSteps(
    requirement: TaskRequirement,
    analysis: Record<string, any>,
    context: TaskContext
  ): Promise<ExecutionStep[]> {
    const steps: ExecutionStep[] = []

    steps.push({
      id: `step_test_validation_${Date.now()}`,
      title: 'Validate Test Cases',
      description: 'Validate test case definitions and dependencies',
      type: 'custom',
      order: 2,
      estimatedDuration: 3,
      dependencies: ['step_validation_1'],
      parameters: {
        testCases: analysis.testCases,
        validationType: 'comprehensive'
      },
      validationRules: {
        testCaseValid: true,
        dependenciesResolved: true
      }
    })

    steps.push({
      id: `step_test_execution_${Date.now()}`,
      title: 'Execute Test Suite',
      description: 'Run comprehensive browser automation tests',
      type: 'browser_testing',
      order: 3,
      estimatedDuration: analysis.estimatedTestDuration || 30,
      dependencies: ['step_test_validation_1'],
      parameters: {
        testSuite: analysis.testSuite,
        executionMode: 'comprehensive',
        includeVisual: true,
        includePerformance: true
      },
      validationRules: {
        browserAvailable: true,
        testEnvironment: true,
        parallelExecution: true
      }
    })

    return steps
  }

  /**
   * Create deployment-specific execution steps
   */
  private async createDeploymentSteps(
    requirement: TaskRequirement,
    analysis: Record<string, any>,
    context: TaskContext
  ): Promise<ExecutionStep[]> {
    const steps: ExecutionStep[] = []

    // Environment validation
    steps.push({
      id: `step_env_validation_${Date.now()}`,
      title: 'Validate Environment',
      description: 'Validate deployment environment and requirements',
      type: 'custom',
      order: 2,
      estimatedDuration: 5,
      dependencies: ['step_validation_1'],
      parameters: {
        environment: context.environment,
        requirements: requirement.resources
      },
      validationRules: {
        environmentReady: true,
        resourcesAvailable: true
      }
    })

    // Deployment execution
    steps.push({
      id: `step_deployment_${Date.now()}`,
      title: 'Execute Deployment',
      description: 'Perform deployment operations',
      type: 'custom',
      order: 3,
      estimatedDuration: 20,
      dependencies: ['step_env_validation_1'],
      parameters: {
        deploymentType: 'automated',
        rollbackEnabled: true
      },
      validationRules: {
        deploymentValid: true,
        healthCheck: true
      }
    })

    return steps
  }

  /**
   * Create analysis-specific execution steps
   */
  private async createAnalysisSteps(
    requirement: TaskRequirement,
    analysis: Record<string, any>,
    context: TaskContext
  ): Promise<ExecutionStep[]> {
    const steps: ExecutionStep[] = []

    // Code analysis
    steps.push({
      id: `step_code_analysis_${Date.now()}`,
      title: 'Analyze Code Structure',
      description: 'Perform comprehensive code analysis',
      type: 'code_analysis',
      order: 2,
      estimatedDuration: 10,
      dependencies: ['step_validation_1'],
      parameters: {
        projectPath: context.projectPath,
        analysisDepth: 'comprehensive'
      },
      validationRules: {
        analysisComplete: true,
        qualityMetrics: true
      }
    })

    return steps
  }

  /**
   * Order steps by dependencies
   */
  private orderStepsByDependencies(steps: ExecutionStep[]): ExecutionStep[] {
    const ordered: ExecutionStep[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()

    const visit = (step: ExecutionStep) => {
      if (visiting.has(step.id)) {
        throw new Error(`Circular dependency detected: ${step.id}`)
      }
      if (visited.has(step.id)) {
        return
      }

      visiting.add(step.id)

      // Visit dependencies first
      for (const depId of step.dependencies) {
        const dep = steps.find(s => s.id === depId)
        if (dep) {
          visit(dep)
        }
      }

      visiting.delete(step.id)
      visited.add(step.id)
      ordered.push(step)
    }

    for (const step of steps) {
      if (!visited.has(step.id)) {
        visit(step)
      }
    }

    return ordered
  }

  /**
   * Assess risk level based on requirement and steps
   */
  private assessRiskLevel(
    requirement: TaskRequirement,
    steps: ExecutionStep[],
    context: TaskContext
  ): 'low' | 'medium' | 'high' {
    let riskScore = 0

    // Priority-based risk
    switch (requirement.priority) {
      case 'critical':
        riskScore += 3
        break
      case 'high':
        riskScore += 2
        break
      case 'medium':
        riskScore += 1
        break
    }

    // Complexity-based risk
    if (steps.length > 10) riskScore += 2
    if (requirement.estimatedDuration > 120) riskScore += 1

    // Environment-based risk
    if (context.environment === 'production') riskScore += 2

    // Dependency-based risk
    if (requirement.dependencies.length > 5) riskScore += 1

    if (riskScore >= 5) return 'high'
    if (riskScore >= 3) return 'medium'
    return 'low'
  }

  /**
   * Create fallback strategies for high-risk plans
   */
  private createFallbackStrategies(
    requirement: TaskRequirement,
    steps: ExecutionStep[]
  ): string[] {
    const strategies: string[] = []

    if (requirement.priority === 'critical') {
      strategies.push('Rollback to previous stable state')
      strategies.push('Manual intervention required')
    }

    if (steps.some(step => step.type === 'browser_testing')) {
      strategies.push('Fallback to manual browser testing')
    }

    if (steps.some(step => step.type === 'file_operation')) {
      strategies.push('Restore from backup')
    }

    return strategies
  }

  // Helper methods for complexity assessment
  private assessDevelopmentComplexity(requirement: TaskRequirement): string {
    if (requirement.estimatedDuration > 60) return 'high'
    if (requirement.estimatedDuration > 30) return 'medium'
    return 'low'
  }

  private assessTestingComplexity(requirement: TaskRequirement): string {
    if (requirement.resources.includes('browser')) return 'medium'
    return 'low'
  }

  private assessDeploymentComplexity(requirement: TaskRequirement): string {
    if (requirement.priority === 'critical') return 'high'
    return 'medium'
  }

  private assessAnalysisComplexity(requirement: TaskRequirement): string {
    if (requirement.estimatedDuration > 30) return 'high'
    return 'low'
  }

  // Helper methods for step estimation
  private estimateDevelopmentSteps(requirement: TaskRequirement): number {
    return Math.max(3, Math.ceil(requirement.estimatedDuration / 15))
  }

  private estimateTestingSteps(requirement: TaskRequirement): number {
    return Math.max(2, Math.ceil(requirement.estimatedDuration / 20))
  }

  private estimateDeploymentSteps(requirement: TaskRequirement): number {
    return Math.max(3, Math.ceil(requirement.estimatedDuration / 25))
  }

  private estimateAnalysisSteps(requirement: TaskRequirement): number {
    return Math.max(2, Math.ceil(requirement.estimatedDuration / 30))
  }

  // Helper methods for analysis
  private async analyzeCodeImpact(requirement: TaskRequirement, context: TaskContext): Promise<string[]> {
    // This would integrate with ProjectAnalyzer
    return []
  }

  private async analyzeBrowserRequirements(requirement: TaskRequirement): Promise<string[]> {
    // This would analyze browser-specific requirements
    return []
  }

  private async analyzeFileOperations(requirement: TaskRequirement, context: TaskContext): Promise<any[]> {
    // This would analyze required file operations
    return []
  }
} 