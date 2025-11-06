import type { NextApiRequest, NextApiResponse } from 'next';
import { minder } from 'minder-data-provider';
import { API_ENDPOINTS } from '../../../lib/api';
import type { Post, UpdatePostInput, ApiResponse } from '../../../lib/types';

/**
 * Dynamic API Route: /api/posts/[id]
 * 
 * Handles:
 * - GET /api/posts/:id - Fetch single post
 * - PUT /api/posts/:id - Update post
 * - DELETE /api/posts/:id - Delete post
 * 
 * Why separate GET/PUT/DELETE in one file?
 * - RESTful pattern
 * - Related operations together
 * - Clean organization
 */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<Post | null>>
) {
  const { id } = req.query;

  // Validate ID
  if (!id || Array.isArray(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid post ID',
    });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(id, res);
    case 'PUT':
      return handlePut(id, req.body, res);
    case 'DELETE':
      return handleDelete(id, res);
    default:
      return res.status(405).json({
        success: false,
        error: 'Method not allowed',
      });
  }
}

/**
 * GET /api/posts/:id
 * Fetch single post
 */
async function handleGet(
  id: string,
  res: NextApiResponse<ApiResponse<Post | null>>
) {
  const { data, error, success } = await minder<Post>(
    API_ENDPOINTS.POST_BY_ID(id)
  );

  if (!success || error) {
    return res.status(404).json({
      success: false,
      error: error?.message || 'Post not found',
    });
  }

  res.status(200).json({
    success: true,
    data,
  });
}

/**
 * PUT /api/posts/:id
 * Update post
 * 
 * Why use minder() for PUT?
 * - Automatic method detection (PUT vs POST)
 * - JSON serialization handled
 * - Consistent error handling
 */
async function handlePut(
  id: string,
  body: UpdatePostInput,
  res: NextApiResponse<ApiResponse<Post | null>>
) {
  // Validate input
  if (!body || (!body.title && !body.body)) {
    return res.status(400).json({
      success: false,
      error: 'Title or body required',
    });
  }

  /**
   * minder() auto-detects PUT method from URL with ID
   */
  const { data, error, success } = await minder<Post>(
    API_ENDPOINTS.POST_BY_ID(id),
    body
  );

  if (!success || error) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to update post',
    });
  }

  res.status(200).json({
    success: true,
    data,
  });
}

/**
 * DELETE /api/posts/:id
 * Delete post
 */
async function handleDelete(
  id: string,
  res: NextApiResponse<ApiResponse<Post | null>>
) {
  const { error, success } = await minder(API_ENDPOINTS.POST_BY_ID(id), {
    method: 'DELETE',
  });

  if (!success || error) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to delete post',
    });
  }

  res.status(200).json({
    success: true,
    data: null,
  });
}
