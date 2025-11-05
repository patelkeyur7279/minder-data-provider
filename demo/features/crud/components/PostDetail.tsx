'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Post } from '@/types/api';
import { Heart, MessageCircle, Eye, Send } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { useLikePost, usePostComments, useAddComment } from '../hooks/usePosts';

interface PostDetailProps {
  post: Post;
  isOpen: boolean;
  onClose: () => void;
}

export function PostDetail({ post, isOpen, onClose }: PostDetailProps) {
  const [comment, setComment] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  
  const likePost = useLikePost();
  const { data: commentsData } = usePostComments(post.id);
  const addComment = useAddComment();

  const handleLike = async () => {
    try {
      await likePost.mutateAsync(post.id);
      setIsLiked(!isLiked);
    } catch (error) {
      console.error('Failed to like post:', error);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;

    try {
      await addComment.mutateAsync({
        postId: post.id,
        content: comment,
      });
      setComment('');
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={post.title}
      size="xl"
    >
      <div className="space-y-6">
        {/* Post Meta */}
        <div className="flex items-center gap-3">
          {post.avatar_url ? (
            <img
              src={post.avatar_url}
              alt={post.username}
              className="w-12 h-12 rounded-full"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold text-lg">
              {post.username?.charAt(0).toUpperCase() || 'U'}
            </div>
          )}
          <div>
            <p className="font-semibold">{post.username || 'Unknown'}</p>
            <p className="text-sm text-slate-500">{formatDateTime(post.created_at)}</p>
          </div>
          <Badge variant={post.published ? 'success' : 'secondary'} className="ml-auto">
            {post.published ? 'Published' : 'Draft'}
          </Badge>
        </div>

        {/* Featured Image */}
        {post.featured_image && (
          <img
            src={post.featured_image}
            alt={post.title}
            className="w-full rounded-lg"
          />
        )}

        {/* Post Content */}
        <div className="prose dark:prose-invert max-w-none">
          <p className="whitespace-pre-wrap">{post.content}</p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6 py-4 border-y border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 text-sm">
            <Eye className="w-4 h-4" />
            <span>{post.view_count || 0} views</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Heart className="w-4 h-4" />
            <span>{post.like_count || 0} likes</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <MessageCircle className="w-4 h-4" />
            <span>{post.comment_count || 0} comments</span>
          </div>
        </div>

        {/* Like Button */}
        <Button
          variant={isLiked ? 'default' : 'outline'}
          onClick={handleLike}
          disabled={likePost.isPending}
          className="w-full"
        >
          <Heart className={`w-4 h-4 mr-2 ${isLiked ? 'fill-current' : ''}`} />
          {isLiked ? 'Liked' : 'Like this post'}
        </Button>

        {/* Comments Section */}
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Comments</h3>

          {/* Add Comment Form */}
          <form onSubmit={handleAddComment} className="flex gap-2">
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Write a comment..."
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={addComment.isPending || !comment.trim()}
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>

          {/* Comments List */}
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {commentsData?.data.length === 0 ? (
              <p className="text-center text-slate-500 py-8">
                No comments yet. Be the first to comment!
              </p>
            ) : (
              commentsData?.data.map((comment) => (
                <div key={comment.id} className="flex gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  {comment.avatar_url ? (
                    <img
                      src={comment.avatar_url}
                      alt={comment.username}
                      className="w-8 h-8 rounded-full"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-blue-500 flex items-center justify-center text-white text-sm font-semibold">
                      {comment.username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{comment.username || 'Unknown'}</span>
                      <span className="text-xs text-slate-500">
                        {formatDateTime(comment.created_at)}
                      </span>
                    </div>
                    <p className="text-sm">{comment.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
