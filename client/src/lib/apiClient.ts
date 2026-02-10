import type { Marathon } from "@shared/schema";

// DTO types with proper date serialization (dates come as ISO strings from API)
export interface MarathonEditionDTO {
  id: string;
  marathonId: string;
  year: number;
  raceDate: string | null;
  registrationStatus: string | null;
  registrationUrl: string | null;
  registrationOpenDate: string | null;
  registrationCloseDate: string | null;
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarathonDTO extends Omit<Marathon, 'createdAt' | 'updatedAt'> {
  createdAt: string;
  updatedAt: string;
}

export interface MarathonWithEdition extends MarathonDTO {
  nextEdition?: MarathonEditionDTO;
}

export type MarathonListItem = MarathonWithEdition;

export interface MarathonDetail extends MarathonDTO {
  editions: MarathonEditionDTO[];
  reviews: {
    items: ReviewDTO[];
    averageRating: number;
    count: number;
  };
}

export interface ReviewDTO {
  id: string;
  marathonId: string;
  userId: string | null;
  marathonEditionId: string | null;
  userDisplayName: string;
  rating: number;
  comment: string | null;
  likesCount: number;
  reportCount: number;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  username: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface MarathonQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  city?: string;
  country?: string;
  year?: number;
  month?: number;
  status?: string;
  sortBy?: 'name' | 'createdAt' | 'raceDate';
  sortOrder?: 'asc' | 'desc';
}

export interface CreateReviewPayload {
  rating: number;
  comment?: string;
  marathonEditionId?: string;
}

export interface UpdateReviewPayload {
  rating?: number;
  comment?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Request failed" }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Marathon APIs
  async getMarathons(params?: MarathonQueryParams): Promise<PaginatedResponse<MarathonListItem>> {
    const queryParams = new URLSearchParams();
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    const query = queryParams.toString();
    const endpoint = query ? `/marathons?${query}` : '/marathons';
    
    return this.request<PaginatedResponse<MarathonListItem>>(endpoint);
  }

  async getMarathonById(id: string): Promise<MarathonDetail> {
    return this.request<MarathonDetail>(`/marathons/${id}`);
  }

  async searchMarathons(query: string): Promise<{ data: MarathonDTO[] }> {
    return this.request<{ data: MarathonDTO[] }>(`/marathons/search?q=${encodeURIComponent(query)}`);
  }

  async getUpcomingMarathons(limit: number = 10): Promise<{ data: MarathonWithEdition[] }> {
    return this.request<{ data: MarathonWithEdition[] }>(`/marathons/upcoming?limit=${limit}`);
  }

  // Review APIs
  async getMarathonReviews(marathonId: string): Promise<any[]> {
    return this.request<ReviewDTO[]>(`/marathons/${marathonId}/reviews`);
  }

  async createReview(marathonId: string, review: CreateReviewPayload): Promise<ReviewDTO> {
    return this.request<ReviewDTO>(`/marathons/${marathonId}/reviews`, {
      method: 'POST',
      body: JSON.stringify(review),
    });
  }

  async updateReview(reviewId: string, payload: UpdateReviewPayload): Promise<ReviewDTO> {
    return this.request<ReviewDTO>(`/reviews/${reviewId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteReview(reviewId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/reviews/${reviewId}`, {
      method: 'DELETE',
    });
  }

  async likeReview(reviewId: string): Promise<ReviewDTO> {
    return this.request<ReviewDTO>(`/reviews/${reviewId}/like`, {
      method: 'POST',
    });
  }

  async reportReview(reviewId: string): Promise<ReviewDTO> {
    return this.request<ReviewDTO>(`/reviews/${reviewId}/report`, {
      method: 'POST',
    });
  }

  async register(username: string, password: string): Promise<{ user: AuthUser }> {
    return this.request<{ user: AuthUser }>(`/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async login(username: string, password: string): Promise<{ user: AuthUser }> {
    return this.request<{ user: AuthUser }>(`/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async logout(): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/auth/logout`, {
      method: 'POST',
    });
  }

  async getCurrentUser(): Promise<{ user: AuthUser }> {
    return this.request<{ user: AuthUser }>(`/users/me`);
  }

  async getMyReviews(): Promise<{ data: ReviewDTO[] }> {
    return this.request<{ data: ReviewDTO[] }>(`/users/me/reviews`);
  }
}

export const apiClient = new ApiClient();
