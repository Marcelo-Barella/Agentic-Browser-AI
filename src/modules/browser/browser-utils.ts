/**
 * Utility functions for browser operations
 */

/**
 * Convert headless parameter from various input types to proper boolean or "new" value
 * @param headless - The headless parameter value (string, boolean, or undefined)
 * @returns Proper headless value for Puppeteer
 */
export function convertHeadlessParameter(headless: any): boolean | "new" {
  console.log(`🔧 [BrowserUtils] Converting headless parameter:`, {
    input: headless,
    type: typeof headless,
    isUndefined: headless === undefined,
    isNull: headless === null
  })
  
  if (headless === undefined || headless === null) {
    console.log(`🔧 [BrowserUtils] Headless is undefined/null, defaulting to "new"`)
    return "new" // Default to new headless mode
  }
  
  if (typeof headless === 'boolean') {
    console.log(`🔧 [BrowserUtils] Headless is boolean: ${headless}`)
    return headless
  }
  
  if (typeof headless === 'string') {
    console.log(`🔧 [BrowserUtils] Headless is string: "${headless}"`)
    if (headless === 'false') {
      console.log(`🔧 [BrowserUtils] Converting string "false" to boolean false`)
      return false
    }
    if (headless === 'true') {
      console.log(`🔧 [BrowserUtils] Converting string "true" to boolean true`)
      return true
    }
    if (headless === 'new') {
      console.log(`🔧 [BrowserUtils] Converting string "new" to "new"`)
      return "new"
    }
    // For any other string value, convert to boolean
    const result = Boolean(headless)
    console.log(`🔧 [BrowserUtils] Converting other string "${headless}" to boolean: ${result}`)
    return result
  }
  
  // For any other type, convert to boolean
  const result = Boolean(headless)
  console.log(`🔧 [BrowserUtils] Converting other type ${typeof headless} to boolean: ${result}`)
  return result
}

/**
 * Validate and convert browser session options
 * @param options - Browser session options
 * @returns Validated and converted options
 */
export function validateBrowserOptions(options?: { headless?: any }): { headless: boolean | "new" } {
  return {
    headless: convertHeadlessParameter(options?.headless)
  }
}


