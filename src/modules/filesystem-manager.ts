import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, unlinkSync, copyFileSync } from 'fs'
import { join, resolve, dirname, extname, basename } from 'path'
import { createHash } from 'crypto'

/**
 * Filesystem Integration Module
 * Provides secure filesystem access with proper permissions and validation
 * Handles file reading, writing, and management operations
 */

export interface FileInfo {
  path: string
  name: string
  extension: string
  size: number
  lastModified: Date
  isDirectory: boolean
  permissions: string
  hash: string
}

export interface DirectoryInfo {
  path: string
  name: string
  files: FileInfo[]
  subdirectories: DirectoryInfo[]
  totalSize: number
  fileCount: number
}

export interface FileOperation {
  type: 'read' | 'write' | 'delete' | 'copy' | 'move'
  path: string
  timestamp: Date
  success: boolean
  error?: string
  size?: number
}

export interface FileValidation {
  isValid: boolean
  errors: string[]
  warnings: string[]
  suggestions: string[]
}

export class FileSystemManager {
  private allowedExtensions: Set<string>
  private maxFileSize: number
  private allowedPaths: Set<string>
  private operationLog: FileOperation[] = []
  private readonly MAX_LOG_SIZE = 1000

  constructor(options: {
    allowedExtensions?: string[]
    maxFileSize?: number
    allowedPaths?: string[]
  } = {}) {
    this.allowedExtensions = new Set(options.allowedExtensions || [
      '.vue', '.ts', '.js', '.json', '.css', '.scss', '.md', '.html', '.txt'
    ])
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024 // 10MB
    this.allowedPaths = new Set(options.allowedPaths || [])
  }

  /**
   * Read file from filesystem with security validation
   */
  async readFile(path: string): Promise<string> {
    try {
      const fullPath = this.resolvePath(path)
      
      // Validate file access
      const validation = await this.validateFileAccess(fullPath, 'read')
      if (!validation.isValid) {
        throw new Error(`File access validation failed: ${validation.errors.join(', ')}`)
      }

      // Check file size
      const stats = statSync(fullPath)
      if (stats.size > this.maxFileSize) {
        throw new Error(`File too large: ${stats.size} bytes (max: ${this.maxFileSize})`)
      }

      // Read file content
      const content = readFileSync(fullPath, 'utf-8')
      
      // Log operation
      this.logOperation({
        type: 'read',
        path: fullPath,
        timestamp: new Date(),
        success: true,
        size: content.length
      })

      return content
    } catch (error) {
      this.logOperation({
        type: 'read',
        path: path,
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
      throw new Error(`Failed to read file ${path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Write file to filesystem with security validation
   */
  async writeFile(path: string, content: string): Promise<void> {
    try {
      const fullPath = this.resolvePath(path)
      
      // Validate file access
      const validation = await this.validateFileAccess(fullPath, 'write')
      if (!validation.isValid) {
        throw new Error(`File access validation failed: ${validation.errors.join(', ')}`)
      }

      // Check content size
      if (content.length > this.maxFileSize) {
        throw new Error(`Content too large: ${content.length} bytes (max: ${this.maxFileSize})`)
      }

      // Ensure directory exists
      const dir = dirname(fullPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      // Write file content
      writeFileSync(fullPath, content, 'utf-8')
      
      // Log operation
      this.logOperation({
        type: 'write',
        path: fullPath,
        timestamp: new Date(),
        success: true,
        size: content.length
      })
    } catch (error) {
      this.logOperation({
        type: 'write',
        path: path,
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
      throw new Error(`Failed to write file ${path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * List directory contents with security validation
   */
  async listDirectory(path: string): Promise<DirectoryInfo> {
    try {
      const fullPath = this.resolvePath(path)
      
      // Validate directory access
      const validation = await this.validateFileAccess(fullPath, 'read')
      if (!validation.isValid) {
        throw new Error(`Directory access validation failed: ${validation.errors.join(', ')}`)
      }

      // Check if path is directory
      const stats = statSync(fullPath)
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${path}`)
      }

      // Read directory contents
      const items = readdirSync(fullPath)
      const files: FileInfo[] = []
      const subdirectories: DirectoryInfo[] = []
      let totalSize = 0
      let fileCount = 0

      for (const item of items) {
        const itemPath = join(fullPath, item)
        const itemStats = statSync(itemPath)
        
        if (itemStats.isDirectory()) {
          // Recursively list subdirectory
          const subdir = await this.listDirectory(itemPath)
          subdirectories.push(subdir)
          totalSize += subdir.totalSize
          fileCount += subdir.fileCount
        } else {
          // Add file info
          const fileInfo = await this.getFileInfo(itemPath)
          files.push(fileInfo)
          totalSize += fileInfo.size
          fileCount++
        }
      }

      const directoryInfo: DirectoryInfo = {
        path: fullPath,
        name: basename(fullPath),
        files,
        subdirectories,
        totalSize,
        fileCount
      }

      return directoryInfo
    } catch (error) {
      throw new Error(`Failed to list directory ${path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Validate file permissions and access
   */
  async validatePermissions(path: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(path)
      const validation = await this.validateFileAccess(fullPath, 'read')
      return validation.isValid
    } catch {
      return false
    }
  }

  /**
   * Get detailed file information
   */
  async getFileInfo(path: string): Promise<FileInfo> {
    try {
      const fullPath = this.resolvePath(path)
      const stats = statSync(fullPath)
      const content = readFileSync(fullPath, 'utf-8')
      
      return {
        path: fullPath,
        name: basename(fullPath),
        extension: extname(fullPath),
        size: stats.size,
        lastModified: stats.mtime,
        isDirectory: stats.isDirectory(),
        permissions: stats.mode.toString(8),
        hash: this.calculateHash(content)
      }
    } catch (error) {
      throw new Error(`Failed to get file info for ${path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Copy file with validation
   */
  async copyFile(sourcePath: string, targetPath: string): Promise<void> {
    try {
      const sourceFullPath = this.resolvePath(sourcePath)
      const targetFullPath = this.resolvePath(targetPath)
      
      // Validate source file access
      const sourceValidation = await this.validateFileAccess(sourceFullPath, 'read')
      if (!sourceValidation.isValid) {
        throw new Error(`Source file access validation failed: ${sourceValidation.errors.join(', ')}`)
      }

      // Validate target directory access
      const targetDir = dirname(targetFullPath)
      const targetValidation = await this.validateFileAccess(targetDir, 'write')
      if (!targetValidation.isValid) {
        throw new Error(`Target directory access validation failed: ${targetValidation.errors.join(', ')}`)
      }

      // Ensure target directory exists
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true })
      }

      // Copy file
      copyFileSync(sourceFullPath, targetFullPath)
      
      // Log operation
      this.logOperation({
        type: 'copy',
        path: `${sourceFullPath} -> ${targetFullPath}`,
        timestamp: new Date(),
        success: true
      })
    } catch (error) {
      this.logOperation({
        type: 'copy',
        path: `${sourcePath} -> ${targetPath}`,
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
      throw new Error(`Failed to copy file ${sourcePath} to ${targetPath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Delete file with validation
   */
  async deleteFile(path: string): Promise<void> {
    try {
      const fullPath = this.resolvePath(path)
      
      // Validate file access
      const validation = await this.validateFileAccess(fullPath, 'write')
      if (!validation.isValid) {
        throw new Error(`File access validation failed: ${validation.errors.join(', ')}`)
      }

      // Check if file exists
      if (!existsSync(fullPath)) {
        throw new Error(`File does not exist: ${path}`)
      }

      // Delete file
      unlinkSync(fullPath)
      
      // Log operation
      this.logOperation({
        type: 'delete',
        path: fullPath,
        timestamp: new Date(),
        success: true
      })
    } catch (error) {
      this.logOperation({
        type: 'delete',
        path: path,
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
      throw new Error(`Failed to delete file ${path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Search for files by pattern
   */
  async searchFiles(pattern: string, directory: string = '.'): Promise<FileInfo[]> {
    try {
      const fullDir = this.resolvePath(directory)
      const results: FileInfo[] = []
      
      // Validate directory access
      const validation = await this.validateFileAccess(fullDir, 'read')
      if (!validation.isValid) {
        throw new Error(`Directory access validation failed: ${validation.errors.join(', ')}`)
      }

      // Recursively search for files
      await this.searchFilesRecursive(fullDir, pattern, results)
      
      return results
    } catch (error) {
      throw new Error(`Failed to search files: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Get operation log
   */
  getOperationLog(): FileOperation[] {
    return [...this.operationLog]
  }

  /**
   * Clear operation log
   */
  clearOperationLog(): void {
    this.operationLog = []
  }

  /**
   * Resolve and validate file path
   */
  private resolvePath(path: string): string {
    const resolvedPath = resolve(path)
    
    // Check if path is within allowed paths
    if (this.allowedPaths.size > 0) {
      const isAllowed = Array.from(this.allowedPaths).some(allowedPath => 
        resolvedPath.startsWith(resolve(allowedPath))
      )
      if (!isAllowed) {
        throw new Error(`Path not allowed: ${path}`)
      }
    }
    
    return resolvedPath
  }

  /**
   * Validate file access permissions
   */
  private async validateFileAccess(path: string, operation: 'read' | 'write'): Promise<FileValidation> {
    const errors: string[] = []
    const warnings: string[] = []
    const suggestions: string[] = []

    try {
      // Check if file exists
      if (!existsSync(path)) {
        if (operation === 'read') {
          errors.push(`File does not exist: ${path}`)
        }
        // For write operations, we'll create the file
      }

      // Check file extension
      const extension = extname(path).toLowerCase()
      if (!this.allowedExtensions.has(extension)) {
        warnings.push(`File extension not in allowed list: ${extension}`)
        suggestions.push(`Consider using one of: ${Array.from(this.allowedExtensions).join(', ')}`)
      }

      // Check file size for read operations
      if (operation === 'read' && existsSync(path)) {
        const stats = statSync(path)
        if (stats.size > this.maxFileSize) {
          errors.push(`File too large: ${stats.size} bytes (max: ${this.maxFileSize})`)
        }
      }

      // Check if path contains suspicious patterns
      if (path.includes('..') || path.includes('~')) {
        warnings.push('Path contains potentially unsafe patterns')
      }

    } catch (error) {
              errors.push(`Access validation failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    }
  }

  /**
   * Calculate file content hash
   */
  private calculateHash(content: string): string {
    return createHash('sha256').update(content).digest('hex')
  }

  /**
   * Log file operation
   */
  private logOperation(operation: FileOperation): void {
    this.operationLog.push(operation)
    
    // Keep log size manageable
    if (this.operationLog.length > this.MAX_LOG_SIZE) {
      this.operationLog = this.operationLog.slice(-this.MAX_LOG_SIZE)
    }
  }

  /**
   * Recursively search for files
   */
  private async searchFilesRecursive(dir: string, pattern: string, results: FileInfo[]): Promise<void> {
    try {
      const items = readdirSync(dir)
      
      for (const item of items) {
        const itemPath = join(dir, item)
        const stats = statSync(itemPath)
        
        if (stats.isDirectory()) {
          // Recursively search subdirectories
          await this.searchFilesRecursive(itemPath, pattern, results)
        } else {
          // Check if file matches pattern
          if (item.toLowerCase().includes(pattern.toLowerCase())) {
            const fileInfo = await this.getFileInfo(itemPath)
            results.push(fileInfo)
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to search directory ${dir}:`, error)
    }
  }

  /**
   * Add allowed path
   */
  addAllowedPath(path: string): void {
    this.allowedPaths.add(resolve(path))
  }

  /**
   * Remove allowed path
   */
  removeAllowedPath(path: string): void {
    this.allowedPaths.delete(resolve(path))
  }

  /**
   * Get allowed paths
   */
  getAllowedPaths(): string[] {
    return Array.from(this.allowedPaths)
  }

  /**
   * Add allowed extension
   */
  addAllowedExtension(extension: string): void {
    this.allowedExtensions.add(extension.toLowerCase())
  }

  /**
   * Remove allowed extension
   */
  removeAllowedExtension(extension: string): void {
    this.allowedExtensions.delete(extension.toLowerCase())
  }

  /**
   * Get allowed extensions
   */
  getAllowedExtensions(): string[] {
    return Array.from(this.allowedExtensions)
  }
} 