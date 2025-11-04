# 🧪 Advanced Features Testing Guide

This guide provides step-by-step instructions for testing the advanced features implemented in Task #6.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Starting the Demo App](#starting-the-demo-app)
3. [Testing Query Builder](#testing-query-builder)
4. [Testing Plugin System](#testing-plugin-system)
5. [Testing DevTools](#testing-devtools)
6. [Integration Testing](#integration-testing)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before testing, ensure you have:

- ✅ All dependencies installed (`npm install`)
- ✅ Main package built (`npm run build` in root)
- ✅ Demo app built (`npm run build` in demo folder)
- ✅ All tests passing (`npm test` - should show 98 passing tests)

---

## Starting the Demo App

### Step 1: Build the Main Package

```bash
cd /Users/patelkeyur7279/Desktop/ReactCourse/minder-data-provider
npm run build
```

**Expected Output:**
```
✓ Build success
Total: ~220KB (CJS + ESM + DTS)
```

### Step 2: Start the Demo App

```bash
cd demo
npm run dev
```

**Expected Output:**
```
▲ Next.js 14.0.3
- Local:        http://localhost:5100
✓ Ready in 1323ms
```

### Step 3: Open in Browser

Navigate to: **http://localhost:5100**

You should see the homepage with a new card: **🛠️ Advanced Features**

---

## Testing Query Builder

### Access the Feature

1. Go to: **http://localhost:5100/advanced-features**
2. Click the **🔍 Query** tab (should be selected by default)

### Test Scenarios

#### Scenario 1: Basic Filtering

1. **Role Filter**: Select "Admin" from dropdown
2. Click **🔍 Build Query**
3. **Expected Results:**
   - Generated URL shows: `/api/users?role=admin`
   - Table displays only admin users (every 3rd user)
   - Results count updates

#### Scenario 2: Age Filtering

1. **Min Age**: Enter `30`
2. Click **🔍 Build Query**
3. **Expected Results:**
   - Generated URL shows: `/api/users?age_gte=30`
   - Table displays only users age 30 and above

#### Scenario 3: Search Functionality

1. **Search**: Type "User 1" (searches names and emails)
2. Click **🔍 Build Query**
3. **Expected Results:**
   - Generated URL shows: `/api/users?search=User+1`
   - Table displays users with "User 1" in name or email

#### Scenario 4: Sorting

1. **Sort By**: Select "Age"
2. **Sort Order**: Select "Descending"
3. Click **🔍 Build Query**
4. **Expected Results:**
   - Generated URL shows: `/api/users?sort=-age`
   - Table displays users sorted by age (highest first)

#### Scenario 5: Complex Query

1. **Role Filter**: "Editor"
2. **Min Age**: `25`
3. **Search**: "User"
4. **Sort By**: "Name"
5. **Sort Order**: "Ascending"
6. Click **🔍 Build Query**
7. **Expected Results:**
   - Generated URL shows all parameters combined
   - Filters are applied in correct order
   - Results match all criteria

#### Scenario 6: Pagination

1. Build any query with multiple results
2. Verify pagination controls appear
3. Click **Next →** button
4. **Expected Results:**
   - Page number increments
   - New set of results displayed
   - Previous button becomes enabled
5. Click **← Previous** button
6. **Expected Results:**
   - Returns to previous page
   - Results update accordingly

---

## Testing Plugin System

### Access the Feature

1. Go to: **http://localhost:5100/advanced-features**
2. Click the **🔌 Plugins** tab

### Test Scenarios

#### Scenario 1: View Active Plugins

1. Check the **Active Plugins** section
2. **Expected Results:**
   - ✅ LoggerPlugin - Logs requests/responses
   - ✅ RetryPlugin - Auto-retry on failures
   - ✅ AnalyticsPlugin - Track API usage

#### Scenario 2: Test Plugin Execution

1. Click **🧪 Test Plugin Execution** button
2. **Expected Results:**
   - Plugin Logs panel shows:
     ```
     🔌 Executing plugin lifecycle...
     ✅ Plugin execution successful
     ```
   - DevTools Network tab shows new POST request

#### Scenario 3: Monitor Plugin Logs

1. Switch to **🔍 Query** tab
2. Build several queries
3. Switch back to **🔌 Plugins** tab
4. **Expected Results:**
   - Plugin Logs show all requests
   - Color-coded logs (blue for info, green for success, red for errors)
   - Last 10 log entries displayed

#### Scenario 4: Plugin Lifecycle Hooks

1. Review the **Plugin Lifecycle Hooks** section
2. **Expected Hooks Displayed:**
   - `onInit` - Called when plugin is initialized
   - `onRequest` - Intercept requests before sending
   - `onResponse` - Process responses after receiving
   - `onError` - Handle errors and implement retry logic
   - `onCacheHit` - Called when cache entry is found
   - `onCacheMiss` - Called when cache entry is not found
   - `onDestroy` - Cleanup when plugin is removed

---

## Testing DevTools

### Access the Feature

1. Go to: **http://localhost:5100/advanced-features**
2. Click the **🛠️ DevTools** tab

### Test Scenarios

#### Scenario 1: Toggle DevTools Visibility

1. Click **🚫 Hide DevTools** button
2. **Expected Results:**
   - DevTools panel disappears from bottom-right corner
   - Button text changes to "✅ Show DevTools"
3. Click **✅ Show DevTools** button
4. **Expected Results:**
   - DevTools panel reappears
   - Button text changes back to "🚫 Hide DevTools"

#### Scenario 2: Network Tab Monitoring

1. Ensure DevTools is visible
2. Click on **Network** tab in DevTools
3. Switch to **🔍 Query** tab
4. Build several queries
5. Switch back to **🛠️ DevTools** tab
6. Open DevTools Network tab
7. **Expected Results:**
   - All API requests listed with:
     - Request ID
     - HTTP Method (GET, POST, etc.)
     - URL
     - Status Code (200, 201, etc.)
     - Duration (in ms)
     - Timestamp
   - Real-time updates as new requests are made

#### Scenario 3: Performance Tab Monitoring

1. Open DevTools **Performance** tab
2. Build multiple queries
3. **Expected Results:**
   - Total Requests count increases
   - Average Latency updates
   - Cache Hit Rate shows percentage
   - Error Rate displays (should be 0%)
   - Metrics update in real-time

#### Scenario 4: Cache Tab Monitoring

1. Open DevTools **Cache** tab
2. Build queries with caching enabled
3. **Expected Results:**
   - Cache entries displayed with:
     - Cache Key
     - Value (truncated)
     - Timestamp
     - TTL (Time To Live)

#### Scenario 5: State Tab Monitoring

1. Open DevTools **State** tab
2. Navigate between different tabs
3. Build queries
4. **Expected Results:**
   - State snapshots captured
   - Each snapshot shows:
     - Route
     - Data snapshot
     - Timestamp

---

## Integration Testing

### Test All Features Together

#### Scenario 1: Complete Workflow

1. **Start Fresh:**
   - Refresh the page
   - Ensure DevTools is visible

2. **Query Builder:**
   - Set Role: "Admin"
   - Set Min Age: 25
   - Click Build Query

3. **Monitor with DevTools:**
   - Check Network tab - see GET request
   - Check Performance tab - see metrics update
   - Check Cache tab - see cache entry (if caching enabled)

4. **Plugin Monitoring:**
   - Switch to Plugins tab
   - See logs from LoggerPlugin

5. **Pagination:**
   - Return to Query tab
   - Click through pages
   - See each request in DevTools

#### Scenario 2: Error Handling

1. **Simulate Error:**
   - Modify query to invalid endpoint
   - Build query

2. **Expected Results:**
   - DevTools shows error status
   - Plugin logs show error
   - Error rate increases in Performance tab

---

## Troubleshooting

### Issue: Page Not Loading

**Solution:**
```bash
# Rebuild main package
cd /Users/patelkeyur7279/Desktop/ReactCourse/minder-data-provider
npm run build

# Restart demo app
cd demo
npm run dev
```

### Issue: DevTools Not Showing

**Causes & Solutions:**

1. **DevTools hidden by user:**
   - Click "Show DevTools" button

2. **Position issue:**
   - DevTools is bottom-right by default
   - Check if it's off-screen on smaller displays

3. **Configuration issue:**
   - Check console for errors
   - DevTools only shows in development mode

### Issue: Queries Not Working

**Causes & Solutions:**

1. **Check Query URL:**
   - Verify generated URL is correct
   - Look for syntax errors in filters

2. **Check Network Tab:**
   - See if request was sent
   - Check response status

3. **Clear Filters:**
   - Reset filters to default
   - Try simple query first

### Issue: Plugins Not Logging

**Causes & Solutions:**

1. **Plugin Initialization:**
   - Refresh page
   - Check browser console for errors

2. **Log Display:**
   - Logs auto-scroll
   - Try building a query to generate logs

3. **Plugin Registration:**
   - Verify plugins are listed in Active Plugins section

### Issue: Pagination Not Working

**Causes & Solutions:**

1. **Not Enough Results:**
   - Need >10 results for pagination
   - Remove filters to get more results

2. **State Issue:**
   - Refresh page
   - Rebuild query

---

## Verification Checklist

Use this checklist to ensure all features work correctly:

### Query Builder ✅
- [ ] Role filtering works
- [ ] Age filtering works
- [ ] Search works
- [ ] Sorting works (asc/desc)
- [ ] Multiple filters combine correctly
- [ ] URL generation is correct
- [ ] Pagination works
- [ ] Results update in real-time

### Plugin System ✅
- [ ] All 3 plugins listed (Logger, Retry, Analytics)
- [ ] Plugin execution works
- [ ] Logs display correctly
- [ ] Logs are color-coded
- [ ] Lifecycle hooks documented
- [ ] Plugins process requests

### DevTools ✅
- [ ] DevTools toggle works
- [ ] Network tab shows requests
- [ ] Performance metrics update
- [ ] Cache tab displays entries
- [ ] State tab captures snapshots
- [ ] Real-time updates work
- [ ] Position is correct (bottom-right)

### Integration ✅
- [ ] Query → DevTools flow works
- [ ] Query → Plugins flow works
- [ ] DevTools → Network monitoring works
- [ ] All tabs switch smoothly
- [ ] No console errors
- [ ] Performance is good

---

## Advanced Testing

### Performance Testing

1. **Build 100+ queries rapidly**
   - Should handle smoothly
   - DevTools should not lag
   - Logs should cap at 100 entries

2. **Monitor memory usage**
   - Open browser DevTools (F12)
   - Check Performance tab
   - Memory should stay stable

### Browser Compatibility

Test in:
- ✅ Chrome/Chromium
- ✅ Firefox
- ✅ Safari
- ✅ Edge

### Mobile Testing

1. Open in mobile browser
2. Verify responsive design
3. Check DevTools positioning
4. Test touch interactions

---

## Success Criteria

✅ **All features working as documented**
✅ **No console errors**
✅ **Good performance (no lag)**
✅ **Real-time updates functioning**
✅ **All 98 tests passing**
✅ **DevTools integrated smoothly**
✅ **Plugins executing correctly**
✅ **Query builder generating valid URLs**

---

## Next Steps

After successful testing:

1. ✅ Commit changes to feature branch
2. ✅ Merge into main branch
3. ✅ Update documentation
4. ✅ Create release notes
5. ✅ Publish to npm (optional)

---

## Support

If you encounter issues not covered in this guide:

1. Check browser console for errors
2. Review test files: `tests/advanced-features.test.ts`
3. Check source code:
   - `src/query/QueryBuilder.ts`
   - `src/plugins/PluginSystem.ts`
   - `src/devtools/DevTools.tsx`

---

**Last Updated:** November 4, 2025
**Version:** 2.0.0
**Branch:** feature/advanced-features
