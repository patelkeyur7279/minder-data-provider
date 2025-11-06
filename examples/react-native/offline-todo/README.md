# React Native Offline Todo

Offline-first todo app demonstrating advanced **Minder Data Provider** patterns for mobile apps.

## 🎯 What You'll Learn

- **Offline-first architecture** - Works without internet
- **Optimistic UI updates** - Instant feedback
- **Background sync** - Auto-sync when online
- **Conflict resolution** - Server/local data merging
- **AsyncStorage** - Persistent local storage
- **Network detection** - Real-time connectivity status
- **Retry logic** - Handle failed operations

## 🚀 Quick Start

```bash
# Run setup script
./setup.sh

# Or manual setup
npm install
npm link ../../../  # Link to minder package

# iOS (macOS only)
cd ios && pod install && cd ..

# Start Metro
npm start

# Run on device (in new terminal)
npm run android  # Android
npm run ios      # iOS (macOS only)
```

## 📁 Project Structure

```
src/
├── App.tsx                # Main component
├── types/
│   └── index.ts          # TypeScript types
├── services/
│   ├── storage.ts        # AsyncStorage operations
│   └── sync.ts           # Background sync logic
└── hooks/
    ├── useNetwork.ts     # Network status hook
    └── useTodos.ts       # Todo management hook
```

## 🎨 Features

### 1. Offline-First Architecture

```typescript
// Works instantly, even offline
await createTodo({ title: "Buy milk" });
// ✓ Saved to AsyncStorage
// ✓ Added to sync queue
// ✓ Will sync when online
```

**Why offline-first?**

- Instant user feedback
- Works anywhere (subway, airplane, poor signal)
- Better UX than loading spinners
- Data preserved during network issues

### 2. Optimistic UI Updates

```typescript
// Update UI immediately
setTodos((prev) => [...prev, newTodo]);

// Sync in background
syncToServer(newTodo);
```

**Why optimistic?**

- App feels instant
- No waiting for server
- User keeps working
- Revert on error if needed

### 3. Background Sync

```typescript
// Queue operations for later
await addToSyncQueue({
  operation: "create",
  data: newTodo,
});

// Process when online
await processSyncQueue();
```

**Why queue?**

- Reliable sync
- Retry failed operations
- Works across app restarts
- No lost data

### 4. Network Detection

```typescript
const { isConnected } = useNetwork();

useEffect(() => {
  if (isConnected) {
    // Auto-sync when online
    processSyncQueue();
  }
}, [isConnected]);
```

**Why detect network?**

- Auto-sync on reconnect
- Show offline indicator
- Adjust behavior
- Better error messages

## 💡 Key Patterns

### Storage Layer

```typescript
// Save to AsyncStorage
await saveTodosToStorage(todos);

// Load from AsyncStorage
const todos = await getTodosFromStorage();
```

**Why AsyncStorage?**

- Persistent across app restarts
- Native performance
- Simple key-value API
- Works offline

### Sync Queue

```typescript
// Add to queue
await addToSyncQueue({
  id: generateId(),
  operation: "create",
  todoId: todo.id,
  data: todo,
  timestamp: new Date().toISOString(),
  retryCount: 0,
});

// Process queue
for (const item of queue) {
  await syncOperation(item);
}
```

**Why queue?**

- Reliable delivery
- Order preservation
- Retry logic
- Audit trail

### Conflict Resolution

```typescript
// Merge strategy
const serverTodos = await fetchFromServer();
const localOnlyTodos = localTodos.filter((t) => t.localOnly);
const merged = [...serverTodos, ...localOnlyTodos];
```

**Why merge?**

- Keep local changes
- Get server updates
- No data loss
- Simple strategy

## 🎮 Try These Scenarios

### Scenario 1: Create Offline

1. Enable airplane mode
2. Add a todo
3. See "pending" status
4. Disable airplane mode
5. Watch auto-sync

### Scenario 2: Bulk Operations

1. Add 5 todos offline
2. Update 3 of them
3. Delete 1
4. See 7 pending operations
5. Come online and sync all

### Scenario 3: Conflict Resolution

1. Go offline
2. Add local-only todos
3. Come online
4. Sync from server
5. See both local and server todos

## 📊 Sync Status Indicators

- 🟢 **Synced** - Saved to server
- 🟡 **Pending** - Waiting to sync
- 🔴 **Failed** - Sync error, will retry

## 🧪 Testing

```bash
# Run tests
npm test

# Watch mode
npm test:watch
```

## 🔧 Configuration

### Change API Endpoint

Edit `src/services/sync.ts`:

```typescript
const API_BASE = "https://your-api.com";
```

### Adjust Sync Behavior

Edit `src/hooks/useTodos.ts`:

```typescript
// Sync immediately vs batch
if (network.isConnected) {
  syncTodo(item); // Immediate
  // OR
  // Wait for manual sync
}
```

## 📱 Platform-Specific Features

### iOS

- Native AsyncStorage
- Network detection via Reachability
- Background app refresh

### Android

- Native SharedPreferences
- Network detection via ConnectivityManager
- Background services

## 🚀 Production Checklist

- [ ] Error handling for all async operations
- [ ] Exponential backoff for retries
- [ ] Conflict resolution strategy
- [ ] Data migration for schema changes
- [ ] Analytics for sync success/failure
- [ ] Maximum queue size limits
- [ ] Old data cleanup
- [ ] Security for sensitive data

## 🎓 Learning Resources

- [React Native AsyncStorage](https://react-native-async-storage.github.io/async-storage/)
- [NetInfo](https://github.com/react-native-netinfo/react-native-netinfo)
- [Offline-First Principles](https://offlinefirst.org/)

## 🤝 Contributing

Found a bug or have a suggestion? Please file an issue!
