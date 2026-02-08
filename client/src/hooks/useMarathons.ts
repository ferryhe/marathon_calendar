import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, type MarathonQueryParams } from '@/lib/apiClient';

// Query keys
export const marathonKeys = {
  all: ['marathons'] as const,
  lists: () => [...marathonKeys.all, 'list'] as const,
  list: (params?: MarathonQueryParams) => [...marathonKeys.lists(), params] as const,
  details: () => [...marathonKeys.all, 'detail'] as const,
  detail: (id: string) => [...marathonKeys.details(), id] as const,
  upcoming: (limit?: number) => [...marathonKeys.all, 'upcoming', limit] as const,
  search: (query: string) => [...marathonKeys.all, 'search', query] as const,
};

// Hooks for marathons
export function useMarathons(params?: MarathonQueryParams) {
  return useQuery({
    queryKey: marathonKeys.list(params),
    queryFn: () => apiClient.getMarathons(params),
  });
}

export function useMarathon(id: string) {
  return useQuery({
    queryKey: marathonKeys.detail(id),
    queryFn: () => apiClient.getMarathonById(id),
    enabled: !!id,
  });
}

export function useUpcomingMarathons(limit: number = 10) {
  return useQuery({
    queryKey: marathonKeys.upcoming(limit),
    queryFn: () => apiClient.getUpcomingMarathons(limit),
  });
}

export function useSearchMarathons(query: string) {
  return useQuery({
    queryKey: marathonKeys.search(query),
    queryFn: () => apiClient.searchMarathons(query),
    enabled: query.length > 0,
  });
}

// Hooks for reviews
export function useMarathonReviews(marathonId: string) {
  return useQuery({
    queryKey: ['reviews', marathonId],
    queryFn: () => apiClient.getMarathonReviews(marathonId),
    enabled: !!marathonId,
  });
}

export function useCreateReview(marathonId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (review: any) => apiClient.createReview(marathonId, review),
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['reviews', marathonId] });
      queryClient.invalidateQueries({ queryKey: marathonKeys.detail(marathonId) });
    },
  });
}
