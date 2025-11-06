import type { NextApiRequest, NextApiResponse } from 'next';
import { minder } from 'minder-data-provider';
import { API_ENDPOINTS } from '../../../lib/api';
import type { Post, ApiResponse } from '../../../lib/types';

/**
 * GET /api/posts
 * 
 * Fetches all posts using minder()
 * 
 * Why use minder() in API routes?
 * - Consistent error handling
 * - Never throws exceptions
 * - Structured response (success, data, error)
 * - Same API as client-side
 */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<Post[]>>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  /**
   * Fetch posts using minder()
   * 
   * Why minder()?
   * - Automatic error handling
   * - No try-catch needed
   * - Returns structured result
   */
  const { data, error, success } = await minder<Post[]>(API_ENDPOINTS.POSTS);

  if (!success || error) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch posts',
    });
  }

  // Return successful response
  res.status(200).json({
    success: true,
    data,
  });
}
