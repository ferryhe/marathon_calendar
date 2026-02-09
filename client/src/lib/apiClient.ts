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

export interface MarathonDetail extends MarathonDTO {
  editions: MarathonEditionDTO[];
  reviews: {
    items: any[];
    averageRating: number;
    count: number;
  };
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
  sortBy?: 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
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
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Marathon APIs
  async getMarathons(params?: MarathonQueryParams): Promise<PaginatedResponse<MarathonDTO>> {
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
    
    return this.request<PaginatedResponse<MarathonDTO>>(endpoint);
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
    return this.request<any[]>(`/marathons/${marathonId}/reviews`);
  }

  async createReview(marathonId: string, review: any): Promise<any> {
    return this.request<any>(`/marathons/${marathonId}/reviews`, {
      method: 'POST',
      body: JSON.stringify(review),
    });
  }
}

export const apiClient = new ApiClient();
