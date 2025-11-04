/**
 * Example 3: CRUD Operations - Create, Read, Update, Delete
 * 
 * This example demonstrates how to perform all CRUD operations:
 * - CREATE: POST requests to add new data
 * - READ: GET requests to fetch data (covered in Example 1)
 * - UPDATE: PUT/PATCH requests to modify data
 * - DELETE: DELETE requests to remove data
 * 
 * WHY: Most applications need to create, modify, and delete data,
 * not just read it. This is the foundation of interactive apps.
 */

import React, { useState } from 'react';
import { useMinder } from '../../src';

/**
 * CONCEPT: Mutations vs Queries
 * 
 * QUERIES (useMinder):
 * - Fetch data (GET requests)
 * - Cached automatically
 * - Re-fetch when stale
 * 
 * MUTATIONS (useMinderMutation):
 * - Change data (POST, PUT, PATCH, DELETE)
 * - NOT cached
 * - Trigger refetch of related queries
 */

interface Post {
  id?: number;
  title: string;
  body: string;
  userId: number;
}

export function CRUDOperationsExample() {
  // Local state for form
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);

  /**
   * STEP 1: READ - Fetch existing data
   * 
   * This is a regular query (GET request)
   */
  const { data: posts, loading, error, refetch } = useMinder<Post[]>('/posts', {
    params: { _limit: 5 }, // Only show first 5 for demo
  });

  /**
   * STEP 2: CREATE - Add new data
   * 
   * WHY use separate mutation hook?
   * - POST requests change server state
   * - Need different handling than GET
   * - Should invalidate/refetch related queries
   * 
   * HOW it works:
   * 1. Call mutate(data) on the hook
   * 2. Sends POST request to /posts
   * 3. On success, refetches the posts list
   */
  const createPost = useMinder<Post>('/posts', {
    method: 'POST',
    autoFetch: false, // Don't fetch on mount - only when mutate() called
  });

  /**
   * STEP 3: UPDATE - Modify existing data
   * 
   * WHY use PUT vs PATCH?
   * - PUT: Replace entire resource
   * - PATCH: Update specific fields
   * 
   * This example uses PUT (full replacement)
   */
  const updatePost = useMinder<Post>('/posts/:id', {
    method: 'PUT',
    autoFetch: false,
  });

  /**
   * STEP 4: DELETE - Remove data
   * 
   * WHY confirm before delete?
   * - Prevent accidental deletion
   * - Better UX
   * - Give users a chance to reconsider
   */
  const deletePost = useMinder<void>('/posts/:id', {
    method: 'DELETE',
    autoFetch: false,
  });

  /**
   * Event Handlers
   * 
   * These functions handle user interactions and call the mutations
   */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // Prevent page reload

    /**
     * Validation
     * 
     * WHY validate on client?
     * - Immediate feedback
     * - Reduce server requests
     * - Better UX
     * 
     * Note: Always validate on server too!
     */
    if (!title.trim() || !body.trim()) {
      alert('Please fill in all fields');
      return;
    }

    const postData: Post = {
      title: title.trim(),
      body: body.trim(),
      userId: 1, // Demo user ID
    };

    try {
      if (editingId) {
        // Update existing post
        const result = await updatePost.mutate({ ...postData, id: editingId });
        if (result.success) {
          refetch(); // Refresh the posts list
          setEditingId(null);
          setTitle('');
          setBody('');
          alert('✅ Post updated successfully!');
        } else {
          alert(`❌ Failed to update post: ${result.error?.message}`);
        }
      } else {
        // Create new post
        const result = await createPost.mutate(postData);
        if (result.success) {
          refetch(); // Refresh the posts list
          setTitle('');
          setBody('');
          alert('✅ Post created successfully!');
        } else {
          alert(`❌ Failed to create post: ${result.error?.message}`);
        }
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  const handleEdit = (post: Post) => {
    /**
     * Fill form with existing data
     * 
     * WHY?
     * - User can modify existing values
     * - Don't have to retype everything
     * - Clear indication of editing mode
     */
    setEditingId(post.id || null);
    setTitle(post.title);
    setBody(post.body);
    
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: number) => {
    /**
     * Confirm before deleting
     * 
     * WHY use window.confirm?
     * - Simple confirmation dialog
     * - Prevents accidents
     * - No extra dependencies needed
     * 
     * For better UX, use a custom modal
     */
    if (window.confirm('Are you sure you want to delete this post?')) {
      try {
        const result = await deletePost.mutate({ id });
        if (result.success) {
          refetch();
          alert('✅ Post deleted successfully!');
        } else {
          alert(`❌ Failed to delete post: ${result.error?.message}`);
        }
      } catch (err: any) {
        alert(`❌ Error: ${err.message}`);
      }
    }
  };

  const handleCancel = () => {
    /**
     * Clear edit mode
     * 
     * WHY?
     * - User can change their mind
     * - Return to create mode
     * - Clear form
     */
    setEditingId(null);
    setTitle('');
    setBody('');
  };

  return (
    <div className="example-card">
      <h2>✏️ CRUD Operations</h2>
      <p className="explanation">
        This example shows how to Create, Read, Update, and Delete data.
        Try creating a post, editing it, and deleting it!
      </p>

      {/* CREATE/UPDATE Form */}
      <div className="form-section">
        <h3>{editingId ? '📝 Edit Post' : '➕ Create New Post'}</h3>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="title">Title *</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter post title..."
              disabled={createPost.loading || updatePost.loading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="body">Body *</label>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Enter post content..."
              rows={4}
              disabled={createPost.loading || updatePost.loading}
              required
            />
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={createPost.loading || updatePost.loading}
            >
              {createPost.loading || updatePost.loading
                ? '⏳ Saving...'
                : editingId
                ? '💾 Update Post'
                : '➕ Create Post'}
            </button>

            {editingId && (
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCancel}
              >
                ❌ Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* READ - Display Posts */}
      <div className="posts-section">
        <h3>📚 Posts List</h3>

        {loading ? (
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Loading posts...</p>
          </div>
        ) : error ? (
          <div className="error-message">
            <p>Error loading posts: {error.message}</p>
            <button onClick={() => refetch()}>Try Again</button>
          </div>
        ) : posts && posts.length > 0 ? (
          <div className="posts-list">
            {posts.map((post) => (
              <div key={post.id} className="post-card">
                <div className="post-header">
                  <h4>{post.title}</h4>
                  <span className="post-id">#{post.id}</span>
                </div>
                
                <p className="post-body">{post.body}</p>
                
                <div className="post-actions">
                  {/* UPDATE Button */}
                  <button
                    onClick={() => handleEdit(post)}
                    className="btn-edit"
                    title="Edit this post"
                  >
                    ✏️ Edit
                  </button>
                  
                  {/* DELETE Button */}
                  <button
                    onClick={() => handleDelete(post.id!)}
                    className="btn-delete"
                    disabled={deletePost.loading}
                    title="Delete this post"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No posts yet. Create one above!</p>
          </div>
        )}
      </div>

      {/* Explanation Section */}
      <div className="crud-guide">
        <h3>📖 Understanding CRUD</h3>

        <div className="crud-operation">
          <h4>CREATE (POST)</h4>
          <p><strong>What:</strong> Add new data to the server</p>
          <p><strong>When:</strong> User submits a form, clicks "Add" button</p>
          <p><strong>HTTP Method:</strong> POST</p>
          <pre>{`const create = useMinderMutation({
  method: 'POST',
  url: '/posts',
  onSuccess: () => refetch()
});

create.mutate({ title, body });`}</pre>
        </div>

        <div className="crud-operation">
          <h4>READ (GET)</h4>
          <p><strong>What:</strong> Fetch data from the server</p>
          <p><strong>When:</strong> Component mounts, page loads</p>
          <p><strong>HTTP Method:</strong> GET</p>
          <pre>{`const { data, loading, error } = useMinder('/posts');`}</pre>
        </div>

        <div className="crud-operation">
          <h4>UPDATE (PUT/PATCH)</h4>
          <p><strong>What:</strong> Modify existing data</p>
          <p><strong>When:</strong> User edits and saves</p>
          <p><strong>HTTP Method:</strong> PUT (replace) or PATCH (partial)</p>
          <pre>{`const update = useMinderMutation({
  method: 'PUT',
  url: (data) => \`/posts/\${data.id}\`,
  onSuccess: () => refetch()
});

update.mutate({ id: 1, title, body });`}</pre>
        </div>

        <div className="crud-operation">
          <h4>DELETE (DELETE)</h4>
          <p><strong>What:</strong> Remove data from server</p>
          <p><strong>When:</strong> User clicks delete (after confirmation)</p>
          <p><strong>HTTP Method:</strong> DELETE</p>
          <pre>{`const remove = useMinderMutation({
  method: 'DELETE',
  url: (id) => \`/posts/\${id}\`,
  onSuccess: () => refetch()
});

remove.mutate(postId);`}</pre>
        </div>
      </div>

      {/* Best Practices */}
      <div className="best-practices">
        <h3>💡 CRUD Best Practices</h3>
        
        <div className="practice">
          <h4>1. Optimistic Updates</h4>
          <p>Update UI immediately, roll back if server fails:</p>
          <pre>{`onMutate: (newData) => {
  // Update UI optimistically
  const oldData = queryClient.getQueryData('/posts');
  queryClient.setQueryData('/posts', [...oldData, newData]);
  return { oldData };
},
onError: (err, newData, context) => {
  // Roll back on error
  queryClient.setQueryData('/posts', context.oldData);
}`}</pre>
        </div>

        <div className="practice">
          <h4>2. Loading States</h4>
          <p>Show progress during mutations:</p>
          <pre>{`<button disabled={mutation.loading}>
  {mutation.loading ? 'Saving...' : 'Save'}
</button>`}</pre>
        </div>

        <div className="practice">
          <h4>3. Error Handling</h4>
          <p>Always handle errors gracefully:</p>
          <pre>{`onError: (error) => {
  // Show user-friendly message
  toast.error(\`Failed: \${error.message}\`);
  
  // Log for debugging
  console.error('Mutation failed:', error);
}`}</pre>
        </div>

        <div className="practice">
          <h4>4. Validation</h4>
          <p>Validate before sending to server:</p>
          <pre>{`if (!data.title || !data.body) {
  alert('All fields required');
  return;
}

if (data.title.length < 5) {
  alert('Title too short');
  return;
}

mutation.mutate(data);`}</pre>
        </div>
      </div>

      {/* Common Mistakes */}
      <div className="common-mistakes">
        <h3>⚠️ Common Mistakes to Avoid</h3>
        <ul>
          <li>
            <strong>❌ Forgetting to refetch:</strong> After mutation, users won't see changes
            <br />
            <strong>✅ Always refetch:</strong> <code>{'onSuccess: () => refetch()'}</code>
          </li>
          <li>
            <strong>❌ No loading state:</strong> Button can be clicked multiple times
            <br />
            <strong>✅ Disable during mutation:</strong> <code>{'disabled={mutation.loading}'}</code>
          </li>
          <li>
            <strong>❌ Silent errors:</strong> User doesn't know what went wrong
            <br />
            <strong>✅ Show error messages:</strong> <code>{'onError: (e) => alert(e.message)'}</code>
          </li>
          <li>
            <strong>❌ No confirmation for delete:</strong> Accidental deletions
            <br />
            <strong>✅ Always confirm:</strong> <code>{'if (confirm(\"Sure?\")) delete()'}</code>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default CRUDOperationsExample;
