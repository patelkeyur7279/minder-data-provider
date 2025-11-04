import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { postsApi } from '@/lib/api';
import { Post, PaginatedResponse } from '@/types/api';
import { CACHE_KEYS } from '@/lib/constants';

export function usePosts(params?: {
  page?: number;
  limit?: number;
  search?: string;
  user_id?: number;
  published?: boolean;
}) {
  return useQuery<PaginatedResponse<Post>>({
    queryKey: [CACHE_KEYS.POSTS, params],
    queryFn: () => postsApi.getAll(params),
  });
}

export function usePost(id: number) {
  return useQuery<Post>({
    queryKey: [CACHE_KEYS.POST, id],
    queryFn: () => postsApi.getById(id),
    enabled: !!id,
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: postsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.POSTS] });
    },
  });
}

export function useUpdatePost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      postsApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.POSTS] });
      queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.POST, variables.id] });
    },
  });
}

export function useDeletePost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: postsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.POSTS] });
    },
  });
}

export function useLikePost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: postsApi.like,
    onSuccess: (_, postId) => {
      queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.POSTS] });
      queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.POST, postId] });
    },
  });
}

export function usePostComments(postId: number, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['comments', postId, params],
    queryFn: () => postsApi.getComments(postId, params),
    enabled: !!postId,
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ postId, content, parent_comment_id }: {
      postId: number;
      content: string;
      parent_comment_id?: number;
    }) => postsApi.addComment(postId, content, parent_comment_id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['comments', variables.postId] });
      queryClient.invalidateQueries({ queryKey: [CACHE_KEYS.POST, variables.postId] });
    },
  });
}
