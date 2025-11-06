import { Router } from 'express';
import { minder, API_ENDPOINTS } from '../config/api';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import type { User, CreateUserInput, UpdateUserInput } from '../types';

/**
 * Users Router
 * 
 * Demonstrates:
 * - Using minder() in Express routes
 * - CRUD operations
 * - Error handling
 * - Input validation
 */

const router = Router();

/**
 * GET /api/users
 * Get all users with optional pagination
 * 
 * Why minder() in Node.js?
 * - Consistent API interface
 * - Built-in error handling
 * - Type-safe responses
 * - Works same as client-side
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    /**
     * Fetch users using minder()
     * Same API as client-side useMinder()!
     */
    const { data, error, success } = await minder<User[]>(API_ENDPOINTS.USERS);

    if (!success || error) {
      throw new AppError(error?.message || 'Failed to fetch users', 500);
    }

    /**
     * Simple pagination
     * In production, use database-level pagination
     */
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedUsers = data?.slice(startIndex, endIndex) || [];

    res.json({
      success: true,
      data: paginatedUsers,
      pagination: {
        page,
        limit,
        total: data?.length || 0,
      },
    });
  })
);

/**
 * GET /api/users/:id
 * Get single user by ID
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Validate ID
    if (!id || isNaN(Number(id))) {
      throw new AppError('Invalid user ID', 400, 'INVALID_ID');
    }

    const { data, error, success } = await minder<User>(
      API_ENDPOINTS.USER_BY_ID(id)
    );

    if (!success || error) {
      throw new AppError(error?.message || 'User not found', 404, 'USER_NOT_FOUND');
    }

    res.json({
      success: true,
      data,
    });
  })
);

/**
 * POST /api/users
 * Create new user
 * 
 * Demonstrates:
 * - POST request with minder()
 * - Input validation
 * - Error handling
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input: CreateUserInput = req.body;

    // Validate input
    if (!input.name || !input.username || !input.email) {
      throw new AppError(
        'Name, username, and email are required',
        400,
        'VALIDATION_ERROR'
      );
    }

    if (!input.email.includes('@')) {
      throw new AppError('Invalid email format', 400, 'INVALID_EMAIL');
    }

    /**
     * Create user using minder()
     * Pass data as second parameter
     */
    const { data, error, success } = await minder<User>(
      API_ENDPOINTS.USERS,
      input,
      { method: 'POST' }
    );

    if (!success || error) {
      throw new AppError(error?.message || 'Failed to create user', 500);
    }

    res.status(201).json({
      success: true,
      data,
    });
  })
);

/**
 * PUT /api/users/:id
 * Update user
 */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const input: UpdateUserInput = req.body;

    if (!id || isNaN(Number(id))) {
      throw new AppError('Invalid user ID', 400, 'INVALID_ID');
    }

    // Validate email if provided
    if (input.email && !input.email.includes('@')) {
      throw new AppError('Invalid email format', 400, 'INVALID_EMAIL');
    }

    const { data, error, success } = await minder<User>(
      API_ENDPOINTS.USER_BY_ID(id),
      input,
      { method: 'PUT' }
    );

    if (!success || error) {
      throw new AppError(error?.message || 'Failed to update user', 500);
    }

    res.json({
      success: true,
      data,
    });
  })
);

/**
 * DELETE /api/users/:id
 * Delete user
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!id || isNaN(Number(id))) {
      throw new AppError('Invalid user ID', 400, 'INVALID_ID');
    }

    const { error, success } = await minder(
      API_ENDPOINTS.USER_BY_ID(id),
      undefined,
      { method: 'DELETE' }
    );

    if (!success || error) {
      throw new AppError(error?.message || 'Failed to delete user', 500);
    }

    res.json({
      success: true,
      data: { message: 'User deleted successfully' },
    });
  })
);

export default router;
