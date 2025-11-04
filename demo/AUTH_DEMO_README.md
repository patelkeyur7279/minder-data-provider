# 🔐 Authentication Demo - Complete Guide

This is a production-ready authentication system built with **Minder Data Provider** and **DummyJSON API**.

## 📋 Features

### ✨ Authentication Flow
- **Login Page** - Secure user authentication
- **Register Page** - New user registration with validation
- **Dashboard** - Protected route with user management
- **Auto-redirect** - Redirects to login if not authenticated
- **Token Management** - Stores access/refresh tokens in localStorage

### 👥 User Management
- **View Users** - Paginated user list (10 users per page)
- **Search Users** - Real-time user search
- **User Profiles** - Display detailed user information
- **Current User** - Show logged-in user profile

### 🛡️ Security Features
- **Protected Routes** - Dashboard requires authentication
- **Token Storage** - Secure localStorage management
- **Auto Logout** - Clear all auth data on logout
- **Form Validation** - Password length, email format, etc.

## 🚀 Quick Start

### 1. Navigate to Login
```
http://localhost:5100/auth/login
```

### 2. Use Demo Credentials

**Option 1:**
- Username: `emilys`
- Password: `emilyspass`

**Option 2:**
- Username: `michaelw`
- Password: `michaelwpass`

### 3. Explore the Dashboard
After login, you'll be redirected to the dashboard where you can:
- View your profile
- Browse all users
- Search for specific users
- Navigate through pages

## 📁 File Structure

```
demo/pages/auth/
├── login.tsx       # Login page with authentication
├── register.tsx    # Registration page with validation
└── dashboard.tsx   # Protected dashboard with user management
```

## 💻 Code Examples

### Login Implementation

```typescript
import { minder } from 'minder-data-provider';

const handleLogin = async (username: string, password: string) => {
  const { data, error } = await minder(
    'https://dummyjson.com/auth/login',
    { username, password },
    { method: 'POST' }
  );

  if (data) {
    // Store tokens
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data));
    
    // Redirect to dashboard
    router.push('/auth/dashboard');
  }
};
```

### Protected Route Pattern

```typescript
useEffect(() => {
  const token = localStorage.getItem('accessToken');
  const userStr = localStorage.getItem('user');

  if (!token || !userStr) {
    // Not authenticated, redirect to login
    router.push('/auth/login');
    return;
  }

  // Load user data
  const user = JSON.parse(userStr);
  setCurrentUser(user);
}, []);
```

### Load Users with Pagination

```typescript
const loadUsers = async (page = 1) => {
  const skip = (page - 1) * usersPerPage;
  
  const { data, error } = await minder(
    `https://dummyjson.com/users?limit=${usersPerPage}&skip=${skip}`
  );

  if (data) {
    setUsers(data.users);
    setTotalUsers(data.total);
  }
};
```

### Search Users

```typescript
const searchUsers = async (query: string) => {
  const { data, error } = await minder(
    `https://dummyjson.com/users/search?q=${encodeURIComponent(query)}`
  );

  if (data) {
    setUsers(data.users);
  }
};
```

## 🎯 Key Concepts

### 1. Token Management
```typescript
// Store tokens
localStorage.setItem('accessToken', token);
localStorage.setItem('refreshToken', refreshToken);
localStorage.setItem('user', JSON.stringify(userData));

// Retrieve tokens
const token = localStorage.getItem('accessToken');

// Clear on logout
localStorage.removeItem('accessToken');
localStorage.removeItem('refreshToken');
localStorage.removeItem('user');
```

### 2. Protected Routes
```typescript
// Check authentication on component mount
useEffect(() => {
  const token = localStorage.getItem('accessToken');
  if (!token) {
    router.push('/auth/login');
  }
}, []);
```

### 3. Error Handling
```typescript
const { data, error } = await minder(url, payload, options);

if (error) {
  // Handle error gracefully
  setError(error.message || 'Operation failed');
  return;
}

if (data) {
  // Success! Process data
  processData(data);
}
```

## 🔑 API Endpoints Used

### Authentication
- **POST** `https://dummyjson.com/auth/login`
  - Login with username/password
  - Returns: accessToken, refreshToken, user data

### User Management
- **POST** `https://dummyjson.com/users/add`
  - Create new user
  - Returns: user data with ID

- **GET** `https://dummyjson.com/users?limit=10&skip=0`
  - Get paginated users
  - Returns: users array, total count

- **GET** `https://dummyjson.com/users/search?q=query`
  - Search users
  - Returns: matching users

## 🎨 UI Features

### Login Page
- Clean, modern card design
- Pre-filled demo credentials
- Loading states
- Error messages
- Links to register & home

### Register Page
- Two-column form layout
- Real-time validation
- Success confirmation
- Auto-redirect after registration

### Dashboard
- User profile card with avatar
- Searchable user grid
- Pagination controls
- Responsive design
- Logout functionality

## 🛠️ Technical Implementation

### State Management
- React `useState` for local state
- `useEffect` for side effects
- `useRouter` for navigation

### Data Fetching
- Universal `minder()` function
- Structured error handling
- Loading states
- No try-catch needed (minder handles errors)

### TypeScript Types
```typescript
interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  image?: string;
  phone?: string;
  age?: number;
  gender?: string;
}

interface UsersResponse {
  users: User[];
  total: number;
  skip: number;
  limit: number;
}
```

## 🔒 Security Best Practices

1. **Token Storage**: Tokens stored in localStorage (in production, consider httpOnly cookies)
2. **Route Protection**: All protected routes check authentication on mount
3. **Auto Logout**: Clears all auth data when user logs out
4. **Error Messages**: User-friendly error messages (no sensitive data exposed)
5. **Validation**: Form validation before API calls

## 🚦 User Flow

1. **Visitor** → Login Page
2. **Enter Credentials** → Submit Form
3. **API Call** → DummyJSON Auth
4. **Success** → Store Tokens → Redirect to Dashboard
5. **Dashboard** → Load Users → Display Data
6. **Search/Pagination** → Filter/Navigate Users
7. **Logout** → Clear Tokens → Redirect to Login

## 📱 Responsive Design

- Mobile-friendly layouts
- Flexible grid systems
- Touch-friendly buttons
- Readable fonts and spacing

## 🎓 Learning Points

1. **Clean Code**: Well-organized, readable, commented code
2. **Type Safety**: Full TypeScript support with interfaces
3. **Error Handling**: Graceful error handling without try-catch
4. **State Management**: Proper React state and lifecycle management
5. **API Integration**: Real-world API integration patterns
6. **Authentication**: Complete auth flow implementation
7. **UX Patterns**: Loading states, error messages, success feedback

## 🔗 Links

- **Login**: `/auth/login`
- **Register**: `/auth/register`
- **Dashboard**: `/auth/dashboard` (protected)
- **Home**: `/`

## 📚 DummyJSON Documentation

For more API endpoints and details:
- Docs: https://dummyjson.com/docs/
- Auth: https://dummyjson.com/docs/auth
- Users: https://dummyjson.com/docs/users

---

**Built with ❤️ using Minder Data Provider**
