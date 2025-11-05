'use client';

import { useState } from 'react';
import { usePosts } from '../hooks/usePosts';
import { PostCard } from './PostCard';
import { PostForm } from './PostForm';
import { PostDetail } from './PostDetail';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Plus, Search } from 'lucide-react';
import { Post } from '@/types/api';
import { debounce } from '@/lib/utils';

export function PostsList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [viewingPost, setViewingPost] = useState<Post | null>(null);

  const { data, isLoading, error } = usePosts({
    page,
    limit: 10,
    search: debouncedSearch,
  });

  // Debounce search
  const handleSearch = debounce((value: string) => {
    setDebouncedSearch(value);
    setPage(1);
  }, 300);

  const handleEdit = (post: Post) => {
    setSelectedPost(post);
    setIsFormOpen(true);
  };

  const handleView = (post: Post) => {
    setViewingPost(post);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedPost(null);
  };

  const handleCloseDetail = () => {
    setViewingPost(null);
  };

  if (isLoading) {
    return <LoadingSpinner message="Loading posts..." />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load posts: {error.message}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div>
            <h2 className="text-2xl font-bold">Posts</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {data?.pagination.total || 0} total posts
            </p>
          </div>
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Post
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            type="search"
            placeholder="Search posts..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              handleSearch(e.target.value);
            }}
            className="pl-10"
          />
        </div>

        {/* Posts Grid */}
        {data?.data.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600 dark:text-slate-400">
              {search ? 'No posts found matching your search.' : 'No posts yet. Create your first post!'}
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {data?.data.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onEdit={handleEdit}
                onView={handleView}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {data && data.pagination.totalPages && data.pagination.totalPages > 1 && (
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <div className="flex items-center gap-2 px-4">
              <span className="text-sm">
                Page {page} of {data.pagination.totalPages}
              </span>
            </div>
            <Button
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= (data.pagination.totalPages || 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Modals */}
      <PostForm
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        post={selectedPost}
      />

      {viewingPost && (
        <PostDetail
          post={viewingPost}
          isOpen={!!viewingPost}
          onClose={handleCloseDetail}
        />
      )}
    </>
  );
}
