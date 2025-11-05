'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import { useCreatePost, useUpdatePost } from '../hooks/usePosts';
import { Post } from '@/types/api';

interface PostFormProps {
  isOpen: boolean;
  onClose: () => void;
  post?: Post | null;
}

export function PostForm({ isOpen, onClose, post }: PostFormProps) {
  const [formData, setFormData] = useState({
    title: post?.title || '',
    content: post?.content || '',
    excerpt: post?.excerpt || '',
    featured_image: post?.featured_image || '',
    published: post?.published ?? true,
  });

  const createPost = useCreatePost();
  const updatePost = useUpdatePost();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (post) {
        await updatePost.mutateAsync({ id: post.id, data: formData });
      } else {
        await createPost.mutateAsync(formData);
      }
      onClose();
      setFormData({
        title: '',
        content: '',
        excerpt: '',
        featured_image: '',
        published: true,
      });
    } catch (error) {
      console.error('Failed to save post:', error);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={post ? 'Edit Post' : 'Create New Post'}
      description={post ? 'Update your post details' : 'Share something with the community'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="title" required>
            Title
          </Label>
          <Input
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder="Enter post title"
            required
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="excerpt">Excerpt</Label>
          <Input
            id="excerpt"
            name="excerpt"
            value={formData.excerpt}
            onChange={handleChange}
            placeholder="Brief description (optional)"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="content" required>
            Content
          </Label>
          <Textarea
            id="content"
            name="content"
            value={formData.content}
            onChange={handleChange}
            placeholder="Write your post content here..."
            required
            rows={8}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="featured_image">Featured Image URL</Label>
          <Input
            id="featured_image"
            name="featured_image"
            value={formData.featured_image}
            onChange={handleChange}
            placeholder="https://example.com/image.jpg"
            className="mt-1"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="published"
            name="published"
            checked={formData.published}
            onChange={handleChange}
            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <Label htmlFor="published" className="cursor-pointer">
            Publish immediately
          </Label>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            type="submit"
            disabled={createPost.isPending || updatePost.isPending}
            className="flex-1"
          >
            {createPost.isPending || updatePost.isPending
              ? 'Saving...'
              : post
              ? 'Update Post'
              : 'Create Post'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
