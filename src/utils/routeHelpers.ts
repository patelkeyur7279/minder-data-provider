/**
 * Levenshtein Distance Algorithm
 * 
 * Calculates the minimum number of single-character edits needed to change
 * one string into another. Used for route name suggestions.
 * 
 * @example
 * levenshteinDistance('kitten', 'sitting') // Returns: 3
 * levenshteinDistance('users', 'user') // Returns: 1
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  // Create a 2D array for dynamic programming
  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= len2; j++) {
    matrix[0]![j] = j;
  }

  // Fill the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;

      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1, // Deletion
        matrix[i]![j - 1]! + 1, // Insertion
        matrix[i - 1]![j - 1]! + cost // Substitution
      );
    }
  }

  return matrix[len1]![len2]!;
}

/**
 * Get route suggestions based on similarity
 * 
 * @param requestedRoute - The route name that wasn't found
 * @param availableRoutes - Array of available route names
 * @param maxDistance - Maximum edit distance to consider (default: 3)
 * @returns Array of suggested route names, sorted by similarity
 */
export function getRouteSuggestions(
  requestedRoute: string,
  availableRoutes: string[],
  maxDistance: number = 3
): string[] {
  const suggestions = availableRoutes
    .map((route) => ({
      route,
      distance: levenshteinDistance(requestedRoute.toLowerCase(), route.toLowerCase()),
    }))
    .filter((item) => item.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .map((item) => item.route);

  return suggestions;
}

/**
 * Replace URL parameters with values
 * 
 * @example
 * replaceUrlParams('/users/:id/posts/:postId', { id: 123, postId: 456 })
 * // Returns: '/users/123/posts/456'
 */
export function replaceUrlParams(
  url: string,
  params?: Record<string, unknown>
): string {
  if (!params) return url;

  let finalUrl = url;

  Object.entries(params).forEach(([key, value]) => {
    finalUrl = finalUrl.replace(`:${key}`, String(value));
  });

  return finalUrl;
}

/**
 * Check if URL has unreplaced parameters
 * 
 * @example
 * hasUnreplacedParams('/users/:id') // Returns: true
 * hasUnreplacedParams('/users/123') // Returns: false
 */
export function hasUnreplacedParams(url: string): boolean {
  return /:[a-zA-Z_][a-zA-Z0-9_]*/.test(url);
}

/**
 * Extract parameter names from URL
 * 
 * @example
 * extractParamNames('/users/:id/posts/:postId')
 * // Returns: ['id', 'postId']
 */
export function extractParamNames(url: string): string[] {
  const matches = url.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g);
  if (!matches) return [];

  return matches.map((match) => match.substring(1));
}
