'use client';

import { Post } from '@/types/api';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Heart, MessageCircle, Eye, Edit, Trash2 } from 'lucide-react';
import { formatDateTime, truncate } from '@/lib/utils';
import { useLikePost, useDeletePost } from '../hooks/usePosts';
import { useState } from 'react';

interface PostCardProps {
  post: Post;
  onEdit?: (post: Post) => void;
  onView?: (post: Post) => void;
  showActions?: boolean;
}

export function PostCard({ post, onEdit, onView, showActions = true }: PostCardProps) {
  const likePost = useLikePost();
  const deletePost = useDeletePost();
  const [isLiked, setIsLiked] = useState(false);

  const handleLike = async () => {
    try {
      await likePost.mutateAsync(post.id);
      setIsLiked(!isLiked);
    } catch (error) {
      console.error('Failed to like post:', error);
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this post?')) {
      try {
        await deletePost.mutateAsync(post.id);
      } catch (error) {
        console.error('Failed to delete post:', error);
      }
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              {post.avatar_url ? (
                <img
                  src={post.avatar_url}
                  alt={post.username}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                  {post.username?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <div>
                <p className="font-medium text-sm">{post.username || 'Unknown'}</p>
                <p className="text-xs text-slate-500">{formatDateTime(post.created_at)}</p>
              </div>
            </div>

            <h3
              className="text-lg font-semibold mb-2 cursor-pointer hover:text-blue-600 transition-colors"
              onClick={() => onView?.(post)}
            >
              {post.title}
            </h3>

            {post.excerpt && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                {truncate(post.excerpt, 150)}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={post.published ? 'success' : 'secondary'}>
                {post.published ? 'Published' : 'Draft'}
              </Badge>
              
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  {post.view_count || 0}
                </span>
                <span className="flex items-center gap-1">
                  <Heart className="w-4 h-4" />
                  {post.like_count || 0}
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="w-4 h-4" />
                  {post.comment_count || 0}
                </span>
              </div>
            </div>
          </div>

          {showActions && (
            <div className="flex gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onEdit?.(post)}
                title="Edit"
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleDelete}
                disabled={deletePost.isPending}
                title="Delete"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex gap-2">
          <Button
            variant={isLiked ? 'default' : 'outline'}
            size="sm"
            onClick={handleLike}
            disabled={likePost.isPending}
            className="flex-1"
          >
            <Heart className={`w-4 h-4 mr-2 ${isLiked ? 'fill-current' : ''}`} />
            {isLiked ? 'Liked' : 'Like'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onView?.(post)}
            className="flex-1"
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Comment
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
