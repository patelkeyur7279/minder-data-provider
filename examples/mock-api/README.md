# Mock API Server

Local API server for testing all Minder examples. Provides mock endpoints compatible with JSONPlaceholder and FakeStore APIs.

## 🚀 Quick Start

```bash
npm install
npm start
```

Server runs on **http://localhost:3001**

## 📚 Endpoints

### Health Check
```bash
GET /health
```

### Users
```bash
GET    /users       # Get all users
GET    /users/:id   # Get user by ID
POST   /users       # Create user
PUT    /users/:id   # Update user
DELETE /users/:id   # Delete user
```

### Posts
```bash
GET    /posts              # Get all posts
GET    /posts/:id          # Get post by ID
GET    /posts?userId=1     # Get posts by user
POST   /posts              # Create post
PUT    /posts/:id          # Update post
DELETE /posts/:id          # Delete post
```

### Products
```bash
GET    /products                      # Get all products
GET    /products/:id                  # Get product by ID
GET    /products?limit=5              # Get limited products
GET    /products?category=electronics # Get by category
GET    /products/categories           # Get all categories
```

### Todos
```bash
GET    /todos              # Get all todos
GET    /todos/:id          # Get todo by ID
GET    /todos?userId=1     # Get todos by user
POST   /todos              # Create todo
PUT    /todos/:id          # Update todo
DELETE /todos/:id          # Delete todo
```

## 🔧 Features

- ✅ CORS enabled
- ✅ JSON responses
- ✅ In-memory data storage
- ✅ Full CRUD operations
- ✅ Query parameter support
- ✅ Error responses

## 📝 Example Requests

### Get all products
```bash
curl http://localhost:3001/products
```

### Create a post
```bash
curl -X POST http://localhost:3001/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"New Post","body":"Content","userId":1}'
```

### Update a user
```bash
curl -X PUT http://localhost:3001/users/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Name"}'
```

## 🐳 Docker

```bash
# Build image
docker build -t mock-api .

# Run container
docker run -p 3001:3001 mock-api
```

## 📦 Environment

```bash
PORT=3001           # Server port
NODE_ENV=development
```
