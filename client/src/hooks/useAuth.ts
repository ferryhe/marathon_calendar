import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

const AUTH_QUERY_KEY = ["auth", "me"] as const;
const FAVORITES_QUERY_KEY = ["users", "me", "favorites"] as const;

export function useCurrentUser() {
  return useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      try {
        const result = await apiClient.getCurrentUser();
        return result.user;
      } catch {
        return null;
      }
    },
  });
}

export function useMyReviews(enabled: boolean = true) {
  return useQuery({
    queryKey: ["users", "me", "reviews"],
    queryFn: async () => {
      const result = await apiClient.getMyReviews();
      return result.data;
    },
    enabled,
  });
}

export function useMyFavorites(enabled: boolean = true) {
  return useQuery({
    queryKey: FAVORITES_QUERY_KEY,
    queryFn: async () => {
      const result = await apiClient.getMyFavorites();
      return result.data;
    },
    enabled,
  });
}

export function useFavoriteStatus(marathonId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["marathons", marathonId, "favorite-status"],
    queryFn: () => apiClient.getFavoriteStatus(marathonId),
    enabled: !!marathonId && enabled,
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      apiClient.register(username, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      apiClient.login(username, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.logout(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      queryClient.removeQueries({ queryKey: FAVORITES_QUERY_KEY });
    },
  });
}

export function useAddFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (marathonId: string) => apiClient.addFavorite(marathonId),
    onSuccess: (_, marathonId) => {
      queryClient.invalidateQueries({ queryKey: FAVORITES_QUERY_KEY });
      queryClient.invalidateQueries({
        queryKey: ["marathons", marathonId, "favorite-status"],
      });
    },
  });
}

export function useRemoveFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (marathonId: string) => apiClient.removeFavorite(marathonId),
    onSuccess: (_, marathonId) => {
      queryClient.invalidateQueries({ queryKey: FAVORITES_QUERY_KEY });
      queryClient.invalidateQueries({
        queryKey: ["marathons", marathonId, "favorite-status"],
      });
    },
  });
}
