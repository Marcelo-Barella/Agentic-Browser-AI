import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, resolve, extname } from 'path'

/**
 * Project Analysis Module
 * Analyzes Nuxt.js project structure and identifies key components
 * Provides comprehensive project understanding for the agentic AI system
 */

export interface ProjectStructure {
  root: string
  type: 'nuxt' | 'vue' | 'unknown'
  version: string
  directories: DirectoryInfo[]
  files: FileInfo[]
  components: VueComponent[]
  pages: PageInfo[]
  layouts: LayoutInfo[]
  composables: ComposableInfo[]
  stores: StoreInfo[]
  plugins: PluginInfo[]
  middleware: MiddlewareInfo[]
  dependencies: DependencyInfo[]
  configuration: ConfigurationInfo
}

export interface DirectoryInfo {
  path: string
  name: string
  type: 'pages' | 'components' | 'layouts' | 'composables' | 'stores' | 'plugins' | 'middleware' | 'assets' | 'public' | 'server' | 'other'
  exists: boolean
  isEmpty: boolean
  subdirectories: string[]
}

export interface FileInfo {
  path: string
  name: string
  extension: string
  size: number
  lastModified: Date
  type: 'vue' | 'ts' | 'js' | 'json' | 'css' | 'scss' | 'md' | 'other'
}

export interface VueComponent {
  path: string
  name: string
  type: 'page' | 'layout' | 'component' | 'composable'
  props: ComponentProp[]
  emits: ComponentEmit[]
  slots: ComponentSlot[]
  dependencies: string[]
  template: string
  script: string
  style: string
  isAsync: boolean
  hasSetup: boolean
}

export interface ComponentProp {
  name: string
  type: string
  required: boolean
  default?: any
  description?: string
}

export interface ComponentEmit {
  name: string
  payload?: string
  description?: string
}

export interface ComponentSlot {
  name: string
  props?: string[]
  description?: string
}

export interface PageInfo {
  path: string
  route: string
  name: string
  component: VueComponent
  meta: Record<string, any>
  middleware: string[]
}

export interface LayoutInfo {
  path: string
  name: string
  component: VueComponent
  slots: string[]
}

export interface ComposableInfo {
  path: string
  name: string
  exports: string[]
  dependencies: string[]
  isAsync: boolean
}

export interface StoreInfo {
  path: string
  name: string
  type: 'pinia' | 'vuex' | 'other'
  state: Record<string, any>
  actions: string[]
  getters: string[]
}

export interface PluginInfo {
  path: string
  name: string
  type: 'client' | 'server' | 'universal'
  dependencies: string[]
}

export interface MiddlewareInfo {
  path: string
  name: string
  type: 'route' | 'global'
  dependencies: string[]
}

export interface DependencyInfo {
  name: string
  version: string
  type: 'dependencies' | 'devDependencies' | 'peerDependencies'
  description?: string
}

export interface ConfigurationInfo {
  nuxtConfig: Record<string, any>
  packageJson: Record<string, any>
  tsConfig?: Record<string, any>
  eslintConfig?: Record<string, any>
  prettierConfig?: Record<string, any>
}

export class ProjectAnalyzer {
  private projectRoot: string
  private structure: ProjectStructure | null = null

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot)
  }

  /**
   * Analyze the complete project structure
   */
  async analyzeStructure(): Promise<ProjectStructure> {
    try {
      console.log(`Starting project analysis for: ${this.projectRoot}`)

      // Validate project root exists
      if (!existsSync(this.projectRoot)) {
        throw new Error(`Project root does not exist: ${this.projectRoot}`)
      }

      // Initialize structure
      this.structure = {
        root: this.projectRoot,
        type: 'unknown',
        version: '',
        directories: [],
        files: [],
        components: [],
        pages: [],
        layouts: [],
        composables: [],
        stores: [],
        plugins: [],
        middleware: [],
        dependencies: [],
        configuration: {
          nuxtConfig: {},
          packageJson: {},
          tsConfig: {},
          eslintConfig: {},
          prettierConfig: {}
        }
      }

      // Analyze project type and version
      await this.analyzeProjectType()

      // Analyze directories
      await this.analyzeDirectories()

      // Analyze files
      await this.analyzeFiles()

      // Analyze components
      await this.analyzeComponents()

      // Analyze pages
      await this.analyzePages()

      // Analyze layouts
      await this.analyzeLayouts()

      // Analyze composables
      await this.analyzeComposables()

      // Analyze stores
      await this.analyzeStores()

      // Analyze plugins
      await this.analyzePlugins()

      // Analyze middleware
      await this.analyzeMiddleware()

      // Analyze dependencies
      await this.analyzeDependencies()

      // Analyze configuration
      await this.analyzeConfiguration()

      console.log('Project analysis completed successfully')
      return this.structure!
    } catch (error) {
      console.error('Project analysis failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Project analysis failed: ${errorMessage}`)
    }
  }

  /**
   * Analyze project type and version
   */
  private async analyzeProjectType(): Promise<void> {
    const packageJsonPath = join(this.projectRoot, 'package.json')
    const nuxtConfigPath = join(this.projectRoot, 'nuxt.config.ts')
    const nuxtConfigJsPath = join(this.projectRoot, 'nuxt.config.js')

    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
      this.structure!.version = packageJson.version || 'unknown'
      this.structure!.configuration.packageJson = packageJson

      // Determine project type
      if (packageJson.dependencies?.nuxt || packageJson.devDependencies?.nuxt) {
        this.structure!.type = 'nuxt'
      } else if (packageJson.dependencies?.vue || packageJson.devDependencies?.vue) {
        this.structure!.type = 'vue'
      }
    }

    // Check for Nuxt configuration
    if (existsSync(nuxtConfigPath) || existsSync(nuxtConfigJsPath)) {
      this.structure!.type = 'nuxt'
    }
  }

  /**
   * Analyze project directories
   */
  private async analyzeDirectories(): Promise<void> {
    const nuxtDirectories = [
      'pages', 'components', 'layouts', 'composables', 'stores',
      'plugins', 'middleware', 'assets', 'public', 'server'
    ]

    for (const dirName of nuxtDirectories) {
      const dirPath = join(this.projectRoot, dirName)
      const exists = existsSync(dirPath)
      
      const directoryInfo: DirectoryInfo = {
        path: dirPath,
        name: dirName,
        type: dirName as DirectoryInfo['type'],
        exists,
        isEmpty: exists ? this.isDirectoryEmpty(dirPath) : true,
        subdirectories: exists ? this.getSubdirectories(dirPath) : []
      }

      this.structure!.directories.push(directoryInfo)
    }
  }

  /**
   * Analyze project files
   */
  private async analyzeFiles(): Promise<void> {
    const files = this.getAllFiles(this.projectRoot)
    
    for (const filePath of files) {
      const relativePath = filePath.replace(this.projectRoot, '').substring(1)
      const stats = statSync(filePath)
      const extension = extname(filePath).toLowerCase()
      
      const fileInfo: FileInfo = {
        path: relativePath,
        name: filePath.split('/').pop() || '',
        extension,
        size: stats.size,
        lastModified: stats.mtime,
        type: this.getFileType(extension)
      }

      this.structure!.files.push(fileInfo)
    }
  }

  /**
   * Analyze Vue components
   */
  private async analyzeComponents(): Promise<void> {
    const componentFiles = this.structure!.files.filter(file => 
      file.type === 'vue' && file.path.includes('components')
    )

    for (const file of componentFiles) {
      const fullPath = join(this.projectRoot, file.path)
      const component = await this.parseVueComponent(fullPath, 'component')
      this.structure!.components.push(component)
    }
  }

  /**
   * Analyze pages
   */
  private async analyzePages(): Promise<void> {
    const pageFiles = this.structure!.files.filter(file => 
      file.type === 'vue' && file.path.includes('pages')
    )

    for (const file of pageFiles) {
      const fullPath = join(this.projectRoot, file.path)
      const component = await this.parseVueComponent(fullPath, 'page')
      
      const pageInfo: PageInfo = {
        path: file.path,
        route: this.generateRouteFromPath(file.path),
        name: component.name,
        component,
        meta: {},
        middleware: []
      }

      this.structure!.pages.push(pageInfo)
    }
  }

  /**
   * Analyze layouts
   */
  private async analyzeLayouts(): Promise<void> {
    const layoutFiles = this.structure!.files.filter(file => 
      file.type === 'vue' && file.path.includes('layouts')
    )

    for (const file of layoutFiles) {
      const fullPath = join(this.projectRoot, file.path)
      const component = await this.parseVueComponent(fullPath, 'layout')
      
      const layoutInfo: LayoutInfo = {
        path: file.path,
        name: component.name,
        component,
        slots: []
      }

      this.structure!.layouts.push(layoutInfo)
    }
  }

  /**
   * Analyze composables
   */
  private async analyzeComposables(): Promise<void> {
    const composableFiles = this.structure!.files.filter(file => 
      (file.type === 'ts' || file.type === 'js') && file.path.includes('composables')
    )

    for (const file of composableFiles) {
      const fullPath = join(this.projectRoot, file.path)
      const composable = await this.parseComposable(fullPath)
      this.structure!.composables.push(composable)
    }
  }

  /**
   * Analyze stores
   */
  private async analyzeStores(): Promise<void> {
    const storeFiles = this.structure!.files.filter(file => 
      (file.type === 'ts' || file.type === 'js') && 
      (file.path.includes('stores') || file.path.includes('store'))
    )

    for (const file of storeFiles) {
      const fullPath = join(this.projectRoot, file.path)
      const store = await this.parseStore(fullPath)
      this.structure!.stores.push(store)
    }
  }

  /**
   * Analyze plugins
   */
  private async analyzePlugins(): Promise<void> {
    const pluginFiles = this.structure!.files.filter(file => 
      (file.type === 'ts' || file.type === 'js') && file.path.includes('plugins')
    )

    for (const file of pluginFiles) {
      const fullPath = join(this.projectRoot, file.path)
      const plugin = await this.parsePlugin(fullPath)
      this.structure!.plugins.push(plugin)
    }
  }

  /**
   * Analyze middleware
   */
  private async analyzeMiddleware(): Promise<void> {
    const middlewareFiles = this.structure!.files.filter(file => 
      (file.type === 'ts' || file.type === 'js') && file.path.includes('middleware')
    )

    for (const file of middlewareFiles) {
      const fullPath = join(this.projectRoot, file.path)
      const middleware = await this.parseMiddleware(fullPath)
      this.structure!.middleware.push(middleware)
    }
  }

  /**
   * Analyze dependencies
   */
  private async analyzeDependencies(): Promise<void> {
    const packageJson = this.structure!.configuration.packageJson

    if (packageJson['dependencies']) {
      for (const [name, version] of Object.entries(packageJson['dependencies'])) {
        this.structure!.dependencies.push({
          name,
          version: version as string,
          type: 'dependencies'
        })
      }
    }

    if (packageJson['devDependencies']) {
      for (const [name, version] of Object.entries(packageJson['devDependencies'])) {
        this.structure!.dependencies.push({
          name,
          version: version as string,
          type: 'devDependencies'
        })
      }
    }
  }

  /**
   * Analyze configuration files
   */
  private async analyzeConfiguration(): Promise<void> {
    const configFiles = [
      { path: 'nuxt.config.ts', key: 'nuxtConfig' },
      { path: 'tsconfig.json', key: 'tsConfig' },
      { path: '.eslintrc.json', key: 'eslintConfig' },
      { path: '.prettierrc.json', key: 'prettierConfig' }
    ]

    for (const config of configFiles) {
      const configPath = join(this.projectRoot, config.path)
      if (existsSync(configPath)) {
        try {
          const content = readFileSync(configPath, 'utf-8')
          this.structure!.configuration[config.key as keyof ConfigurationInfo] = JSON.parse(content)
        } catch (error) {
          console.warn(`Failed to parse ${config.path}:`, error)
        }
      }
    }
  }

  /**
   * Parse Vue component file
   */
  private async parseVueComponent(filePath: string, type: VueComponent['type']): Promise<VueComponent> {
    const content = readFileSync(filePath, 'utf-8')
    const name = filePath.split('/').pop()?.replace('.vue', '') || 'Unknown'

    // Basic parsing - in a real implementation, you'd use a proper Vue parser
    const hasSetup = content.includes('<script setup>')
    const isAsync = content.includes('async')
    
    // Extract template, script, and style sections
    const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/)
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/)
    const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/)

    return {
      path: filePath,
      name,
      type,
      props: [],
      emits: [],
      slots: [],
      dependencies: [],
      template: templateMatch?.[1] || '',
      script: scriptMatch?.[1] || '',
      style: styleMatch?.[1] || '',
      isAsync,
      hasSetup
    }
  }

  /**
   * Parse composable file
   */
  private async parseComposable(filePath: string): Promise<ComposableInfo> {
    const content = readFileSync(filePath, 'utf-8')
    const name = filePath.split('/').pop()?.replace(/\.(ts|js)$/, '') || 'Unknown'

    return {
      path: filePath,
      name,
      exports: [],
      dependencies: [],
      isAsync: content.includes('async')
    }
  }

  /**
   * Parse store file
   */
  private async parseStore(filePath: string): Promise<StoreInfo> {
    const content = readFileSync(filePath, 'utf-8')
    const name = filePath.split('/').pop()?.replace(/\.(ts|js)$/, '') || 'Unknown'

    // Determine store type
    let type: StoreInfo['type'] = 'other'
    if (content.includes('defineStore')) {
      type = 'pinia'
    } else if (content.includes('Vuex')) {
      type = 'vuex'
    }

    return {
      path: filePath,
      name,
      type,
      state: {},
      actions: [],
      getters: []
    }
  }

  /**
   * Parse plugin file
   */
  private async parsePlugin(filePath: string): Promise<PluginInfo> {
    const content = readFileSync(filePath, 'utf-8')
    const name = filePath.split('/').pop()?.replace(/\.(ts|js)$/, '') || 'Unknown'

    // Determine plugin type
    let type: PluginInfo['type'] = 'universal'
    if (content.includes('process.client')) {
      type = 'client'
    } else if (content.includes('process.server')) {
      type = 'server'
    }

    return {
      path: filePath,
      name,
      type,
      dependencies: []
    }
  }

  /**
   * Parse middleware file
   */
  private async parseMiddleware(filePath: string): Promise<MiddlewareInfo> {
    const content = readFileSync(filePath, 'utf-8')
    const name = filePath.split('/').pop()?.replace(/\.(ts|js)$/, '') || 'Unknown'

    return {
      path: filePath,
      name,
      type: 'route',
      dependencies: []
    }
  }

  /**
   * Generate route from page path
   */
  private generateRouteFromPath(pagePath: string): string {
    return pagePath
      .replace('pages/', '')
      .replace('.vue', '')
      .replace(/\/index$/, '/')
      .replace(/\[([^\]]+)\]/g, ':$1')
  }

  /**
   * Get all files in directory recursively
   */
  private getAllFiles(dir: string): string[] {
    const files: string[] = []
    
    try {
      const items = readdirSync(dir)
      
      for (const item of items) {
        const fullPath = join(dir, item)
        const stat = statSync(fullPath)
        
        if (stat.isDirectory()) {
          files.push(...this.getAllFiles(fullPath))
        } else {
          files.push(fullPath)
        }
      }
    } catch (error) {
      console.warn(`Failed to read directory ${dir}:`, error)
    }
    
    return files
  }

  /**
   * Check if directory is empty
   */
  private isDirectoryEmpty(dir: string): boolean {
    try {
      const items = readdirSync(dir)
      return items.length === 0
    } catch {
      return true
    }
  }

  /**
   * Get subdirectories
   */
  private getSubdirectories(dir: string): string[] {
    try {
      const items = readdirSync(dir)
      return items.filter(item => {
        const fullPath = join(dir, item)
        return statSync(fullPath).isDirectory()
      })
    } catch {
      return []
    }
  }

  /**
   * Get file type from extension
   */
  private getFileType(extension: string): FileInfo['type'] {
    const typeMap: Record<string, FileInfo['type']> = {
      '.vue': 'vue',
      '.ts': 'ts',
      '.js': 'js',
      '.json': 'json',
      '.css': 'css',
      '.scss': 'scss',
      '.md': 'md'
    }
    
    return typeMap[extension] || 'other'
  }

  /**
   * Get project structure
   */
  getProjectStructure(): ProjectStructure | null {
    return this.structure
  }

  /**
   * Get components by type
   */
  getComponentsByType(type: VueComponent['type']): VueComponent[] {
    return this.structure?.components.filter(c => c.type === type) || []
  }

  /**
   * Get pages by route pattern
   */
  getPagesByRoute(pattern: string): PageInfo[] {
    return this.structure?.pages.filter(p => p.route.includes(pattern)) || []
  }
} 