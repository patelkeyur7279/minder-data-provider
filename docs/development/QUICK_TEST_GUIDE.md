# 🎯 Step-by-Step Testing Instructions for Advanced Features

## Quick Start (5 Minutes)

### Step 1: Open the Demo App
The demo app is already running at: **http://localhost:5100**

### Step 2: Navigate to Advanced Features
Click on the **"🛠️ Advanced Features"** card on the homepage, or go directly to:
**http://localhost:5100/advanced-features**

---

## 🔍 Test 1: Query Builder (2 minutes)

### What to Do:
1. You'll see the **Query Builder** tab selected by default
2. Try these quick tests:

**Test A: Filter by Role**
- Select **"Admin"** from the Role dropdown
- Click **"🔍 Build Query"**
- ✅ You should see ~33 admin users in the table
- ✅ Generated URL shows: `/api/users?role=admin`

**Test B: Filter by Age**
- Set **Min Age** to `30`
- Click **"🔍 Build Query"**
- ✅ Table shows only users age 30+
- ✅ URL includes: `age_gte=30`

**Test C: Search**
- Type **"User 1"** in the Search box
- Click **"🔍 Build Query"**
- ✅ Shows users matching "User 1"
- ✅ URL includes: `search=User+1`

**Test D: Sorting**
- Select **"Age"** from Sort By
- Select **"Descending"** from Sort Order
- Click **"🔍 Build Query"**
- ✅ Users sorted by age (oldest first)
- ✅ URL includes: `sort=-age`

**Test E: Pagination**
- Build a query with many results
- Click **"Next →"** button
- ✅ Page number changes
- ✅ New results load
- Click **"← Previous"**
- ✅ Returns to previous page

### ✅ Success Indicators:
- Generated URL updates with each change
- Table updates to show filtered results
- Pagination works smoothly
- No console errors

---

## 🔌 Test 2: Plugin System (1 minute)

### What to Do:
1. Click the **"🔌 Plugins"** tab
2. You'll see:
   - **Active Plugins** list (LoggerPlugin, RetryPlugin, AnalyticsPlugin)
   - **Plugin Logs** panel (dark background on right)

**Test A: Execute Plugins**
- Click **"🧪 Test Plugin Execution"** button
- ✅ Plugin Logs shows:
  ```
  🔌 Executing plugin lifecycle...
  ✅ Plugin execution successful
  ```

**Test B: Monitor Logs**
- Switch back to **Query** tab
- Build 2-3 different queries
- Return to **Plugins** tab
- ✅ Logs show all the requests
- ✅ Colored output (blue/green)

### ✅ Success Indicators:
- 3 plugins listed as active
- Logs update in real-time
- Color-coded log entries
- Plugin lifecycle hooks documented below

---

## 🛠️ Test 3: DevTools (2 minutes)

### What to Do:
1. Click the **"🛠️ DevTools"** tab
2. Notice the **DevTools panel** in the bottom-right corner

**Test A: Toggle Visibility**
- Click **"🚫 Hide DevTools"**
- ✅ Panel disappears
- Click **"✅ Show DevTools"**
- ✅ Panel reappears

**Test B: Monitor Network Requests**
- Keep DevTools visible
- Switch to **Query** tab
- Build several queries
- Open DevTools and click **"Network"** tab
- ✅ See all API requests listed with:
  - Method (GET, POST)
  - URL
  - Status (200)
  - Duration (in ms)
  - Timestamp

**Test C: Performance Metrics**
- In DevTools, click **"Performance"** tab
- ✅ See real-time metrics:
  - Total Requests: (increases with each query)
  - Average Latency: ~XXX ms
  - Cache Hit Rate: X%
  - Error Rate: 0%

**Test D: Cache Monitoring**
- Click **"Cache"** tab in DevTools
- ✅ See cached entries (if caching enabled)

**Test E: State Snapshots**
- Click **"State"** tab in DevTools
- ✅ See state snapshots captured over time

### ✅ Success Indicators:
- DevTools panel visible in bottom-right
- All tabs (Network, Cache, Performance, State) functional
- Real-time updates working
- No lag or performance issues

---

## 🎉 Integration Test: Everything Together (2 minutes)

### Complete Workflow:

1. **Start Fresh:**
   - Refresh the page at http://localhost:5100/advanced-features
   - Ensure DevTools is visible (bottom-right corner)

2. **Build a Complex Query:**
   - **Query Tab:**
     - Role: "Editor"
     - Min Age: 25
     - Search: "User"
     - Sort By: "Name"
     - Sort Order: "Ascending"
   - Click **"🔍 Build Query"**

3. **Monitor in DevTools:**
   - Open **Network** tab
   - ✅ See the GET request
   - Check **Performance** tab
   - ✅ See metrics update

4. **Check Plugin Logs:**
   - Switch to **Plugins** tab
   - ✅ See logs from the query

5. **Test Pagination:**
   - Return to **Query** tab
   - Click **"Next →"**
   - ✅ Each page change shows in DevTools Network tab

### ✅ Success Indicators:
- Query builds correctly with all filters
- DevTools captures all activity
- Plugins log all requests
- Pagination works smoothly
- Everything updates in real-time

---

## 🚀 Quick Verification Checklist

Run through this quick checklist:

- [ ] ✅ Query Builder filters work (role, age, search, sort)
- [ ] ✅ Query Builder generates correct URLs
- [ ] ✅ Pagination works (next/previous)
- [ ] ✅ 3 Plugins listed and active
- [ ] ✅ Plugin execution button works
- [ ] ✅ Plugin logs display correctly
- [ ] ✅ DevTools toggle works
- [ ] ✅ DevTools Network tab shows requests
- [ ] ✅ DevTools Performance tab shows metrics
- [ ] ✅ All tabs switch smoothly
- [ ] ✅ No console errors (press F12 to check)
- [ ] ✅ Page is responsive and performant

---

## 📸 What You Should See

### Query Builder Tab:
```
┌─────────────────────────────────────────────┐
│ Role Filter | Min Age | Search | Sort By    │
│ [Admin ▼]  | [30]    | [User 1] | [Name ▼] │
│ Sort Order | [🔍 Build Query]              │
│ [Asc ▼]                                     │
└─────────────────────────────────────────────┘

Generated URL:
/api/users?role=admin&age_gte=30&search=User+1&sort=name&page=1&limit=10

┌─────────────────────────────────────────────┐
│ Results: 33 users found                     │
├──────────────────────────────────────────────┤
│ ID | Name    | Email           | Role  | Age│
│ 3  | User 3  | user3@...       | admin | 22 │
│ 6  | User 6  | user6@...       | admin | 25 │
│ ...                                         │
└─────────────────────────────────────────────┘
Page 1 of 4  [← Previous] [Next →]
```

### Plugins Tab:
```
Active Plugins:
✅ LoggerPlugin - Logs requests/responses
✅ RetryPlugin - Auto-retry on failures
✅ AnalyticsPlugin - Track API usage

[🧪 Test Plugin Execution]

Plugin Logs:
┌─────────────────────────────────────┐
│ 🔌 Executing plugin lifecycle...    │
│ 🚀 Request: GET /api/users          │
│ ✅ Response: 200 OK                 │
│ ✅ Plugin execution successful      │
└─────────────────────────────────────┘
```

### DevTools Panel (Bottom-Right):
```
┌─ Minder DevTools ──────────┐
│ [Network][Cache][Perf][State]│
├────────────────────────────┤
│ GET /api/users       200ms │
│ POST /api/test       150ms │
│ GET /api/users?role  250ms │
└────────────────────────────┘
```

---

## ❓ Troubleshooting

**Issue: Advanced Features page not found**
- Solution: Make sure demo app is running on http://localhost:5100
- Check terminal for errors

**Issue: DevTools not showing**
- Solution: Click "Show DevTools" button in DevTools tab
- DevTools appears in bottom-right corner

**Issue: Queries not updating**
- Solution: Click the "🔍 Build Query" button after changing filters
- Check browser console (F12) for errors

**Issue: No data showing**
- Solution: The demo uses sample data (100 users)
- Try removing all filters first
- Refresh the page

---

## 🎓 What Each Feature Does

### Query Builder
- Builds complex API query URLs
- Filters data by role, age, search terms
- Sorts results ascending/descending
- Handles pagination automatically
- Fluent API: `query('/users').where('role', 'admin').sortBy('name').build()`

### Plugin System
- Extends functionality without modifying core code
- Lifecycle hooks: onInit, onRequest, onResponse, onError, onCacheHit, onCacheMiss, onDestroy
- Built-in plugins: Logger, Retry, Analytics, CacheWarmup, PerformanceMonitor
- Custom plugins can be created easily

### DevTools
- Visual debugging interface
- Monitor network requests in real-time
- Track performance metrics
- Inspect cache entries
- View state snapshots
- Helps debug API issues quickly

---

## ✅ Final Check

If you can complete all these actions without errors, the advanced features are working perfectly:

1. ✅ Build a query with multiple filters
2. ✅ See the generated URL
3. ✅ View filtered results in table
4. ✅ Navigate through pages
5. ✅ Execute plugin test
6. ✅ See plugin logs
7. ✅ Toggle DevTools visibility
8. ✅ View network requests in DevTools
9. ✅ See performance metrics
10. ✅ No console errors

---

## 🎉 Success!

If all tests pass, you've successfully tested:
- ✅ Query Builder with complex filtering
- ✅ Plugin System with lifecycle hooks
- ✅ DevTools with real-time monitoring
- ✅ Integration between all three features

**Total Time:** ~10-15 minutes

---

**Demo App:** http://localhost:5100/advanced-features
**Testing Guide:** ADVANCED_FEATURES_TESTING_GUIDE.md (detailed version)
**Test Suite:** `npm test` (98 tests, all passing)
