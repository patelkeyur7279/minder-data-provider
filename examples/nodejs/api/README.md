# Node.js Express API Example

This example demonstrates how to use **Minder Data Provider** in a Node.js Express server for building REST APIs.

## 🎯 What You'll Learn

- Using `minder()` in Express route handlers
- CRUD operations with consistent API
- Rate limiting middleware
- Error handling patterns
- Input validation
- Security best practices

## 🚀 Quick Start

```bash
# Run setup script
./setup.sh

# Or manual setup
npm install
npm link ../../../  # Link to minder package
cp .env.example .env

# Start development server
npm run dev
```

Server runs at: http://localhost:3001

## 📁 Project Structure

```
src/
├── index.ts              # Express app setup
├── config/
│   └── api.ts           # Minder configuration
├── routes/
│   └── users.ts         # User CRUD endpoints
├── middleware/
│   ├── rateLimiter.ts   # Rate limiting
│   └── errorHandler.ts  # Error handling
└── types/
    └── index.ts         # TypeScript types
```

## 🛣️ API Endpoints

### Health Check

```bash
GET /health
# Returns server status
```

### Users

```bash
GET    /api/users          # List all users (paginated)
GET    /api/users/:id      # Get single user
POST   /api/users          # Create user
PUT    /api/users/:id      # Update user
DELETE /api/users/:id      # Delete user
```

## 💡 Key Concepts

### 1. Using minder() in Routes

```typescript
// Same API as client-side!
const { data, error, success } = await minder<User[]>(API_ENDPOINTS.USERS);

if (!success || error) {
  throw new AppError(error?.message || "Failed to fetch", 500);
}

res.json({ success: true, data });
```

**Why this approach?**

- Consistent interface (same as `useMinder()`)
- Type-safe responses
- Built-in error handling
- Easy to test

### 2. Rate Limiting

```typescript
app.use(
  rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // 100 requests max
  })
);
```

**Why rate limiting?**

- Prevents API abuse
- Protects backend resources
- Fair usage for all clients

### 3. Error Handling

```typescript
// Centralized error handler
app.use(errorHandler);

// Custom errors with status codes
throw new AppError("User not found", 404, "USER_NOT_FOUND");
```

**Why centralized?**

- Consistent error responses
- Single place to log errors
- Cleaner route handlers

### 4. Async Error Handling

```typescript
router.get('/', asyncHandler(async (req, res) => {
  // Any error here automatically caught
  const { data } = await minder(...);
  res.json(data);
}));
```

**Why wrapper?**

- Express doesn't catch async errors by default
- Prevents unhandled promise rejections
- Cleaner code

## 🧪 Testing

```bash
# Run tests
npm test

# Watch mode
npm test:watch
```

## 🔒 Security Features

- **Helmet**: Security HTTP headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: Prevent abuse
- **Input Validation**: Validate all inputs
- **Error Sanitization**: Don't leak internal errors

## 📊 Example Requests

### Create User

```bash
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "username": "johndoe",
    "email": "john@example.com"
  }'
```

### Get Users with Pagination

```bash
curl http://localhost:3001/api/users?page=1&limit=5
```

### Update User

```bash
curl -X PUT http://localhost:3001/api/users/1 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "phone": "555-1234"
  }'
```

## 🎓 Learning Resources

- [Express.js Documentation](https://expressjs.com/)
- [TypeScript with Express](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-1.html)
- [API Security Best Practices](https://owasp.org/www-project-api-security/)

## 🚀 Production Deployment

1. Set environment variables
2. Build the project: `npm run build`
3. Start production server: `npm start`

For production, consider:

- Use Redis for rate limiting
- Implement proper logging (Winston, Pino)
- Add authentication (JWT, OAuth)
- Use process manager (PM2, Docker)
- Enable HTTPS
- Add monitoring (New Relic, DataDog)

## 🤝 Contributing

Found an issue or have a suggestion? Please file an issue!
