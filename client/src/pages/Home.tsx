import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Footprints, Heart, MessageSquare, Mountain, RefreshCw, Search, SlidersHorizontal, User, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { useTranslation } from "react-i18next";
import { MarathonTable } from "@/components/MarathonTable";
import { Footer } from "@/components/Footer";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser, useMyFavorites } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";

type SyncStatus = {
  lastFinishedAt: string | null;
  lastStatus: string | null;
  isRunning: boolean;
  rateLimitedUntil: string | null;
  last24h: Array<{ status: string; count: number }>;
};

function useRelativeTime(iso: string | null): string | null {
  const { t } = useTranslation();
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return t("header.lastUpdated.justNow");
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t("header.lastUpdated.minutesAgo", { count: diffMin });
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return t("header.lastUpdated.hoursAgo", { count: diffHour });
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return t("header.lastUpdated.daysAgo", { count: diffDay });
  return null;
}

const STATUS_KEY: Record<string, string> = {
  "报名中":   "status.open",         // 报名中
  "即将开始": "status.upcoming",      // 即将开始 → 报名未开始
  "已截止":   "status.closed",       // 已截止 → 报名已截止
  "待公布":   "status.upcoming",     // 待公布 → 报名未开始
  "未开放":   "status.upcoming",     // 未开放 → 报名未开始
  "已报满":   "status.closed",       // 已报满 → 报名已截止（报名满了）
  "已完赛":   "status.ended",        // 已完赛
  "已结束":   "status.ended",        // 已结束 → 已完赛
  "已取消":   "status.cancelled",     // 已取消
  "待更新":   "status.upcoming",     // 待更新 → 报名未开始
};

export default function Home() {
  const { t, i18n } = useTranslation();
  const [region, setRegion] = useState<"China" | "Overseas" | "WMM">(() => {
    if (typeof window === "undefined") return "China";
    const v = window.localStorage.getItem("home.region");
    return v === "Overseas" || v === "WMM" || v === "China" ? v : "China";
  });
  const [kind, setKind] = useState<"marathon" | "trail">(() => {
    if (typeof window === "undefined") return "marathon";
    const v = window.localStorage.getItem("home.kind");
    return v === "trail" ? "trail" : "marathon";
  });
  useEffect(() => {
    try { window.localStorage.setItem("home.region", region); } catch {}
  }, [region]);
  useEffect(() => {
    try { window.localStorage.setItem("home.kind", kind); } catch {}
  }, [kind]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"raceDate" | "name" | "createdAt">("raceDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<"all" | "mine">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [, setNowTick] = useState(0);
  const wasRunningRef = useRef(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: currentUser } = useCurrentUser();
  const { data: favorites = [], isLoading: isFavoritesLoading } = useMyFavorites(!!currentUser);

  const { data: syncStatusResp } = useQuery<{ data: SyncStatus }>({
    queryKey: ["/api/marathons/sync-status"],
    refetchInterval: isUpdating ? 2000 : 60_000,
  });
  const syncStatus = syncStatusResp?.data;

  useEffect(() => {
    const id = setInterval(() => setNowTick((tick) => tick + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!syncStatus) return;
    if (wasRunningRef.current && !syncStatus.isRunning) {
      setIsUpdating(false);
      queryClient.invalidateQueries({ queryKey: ["/api/marathons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marathons/upcoming"] });
      toast({ title: t("common.dataUpdated"), duration: 1200 });
    }
    wasRunningRef.current = syncStatus.isRunning;
  }, [syncStatus, queryClient, toast, t]);

  const lastUpdatedText = useRelativeTime(syncStatus?.lastFinishedAt ?? null);

  const favoriteMarathonIds = useMemo(
    () => new Set(favorites.map((item) => item.marathon.id)),
    [favorites],
  );

  const currentYear = new Date().getFullYear();

  const hasActiveFilters =
    monthFilter !== "all" ||
    statusFilter !== "all" ||
    countryFilter !== "all" ||
    sortBy !== "raceDate" ||
    searchQuery !== "";

  const { data: countriesResp } = useQuery({
    queryKey: ["/api/marathons/countries", region, kind],
    queryFn: () => apiClient.getMarathonCountries({ region, kind }),
    staleTime: 5 * 60_000,
    enabled: region !== "China",
  });
  const countries = countriesResp?.data ?? [];

  useEffect(() => {
    setCountryFilter("all");
  }, [region, kind]);

  useEffect(() => {
    if (!currentUser && viewMode === "mine") {
      setViewMode("all");
    }
  }, [currentUser, viewMode]);

  useEffect(() => {
    document.title = viewMode === "mine" ? t("app.titleFavorites") : t("app.title");
  }, [viewMode, t, i18n.language]);

  const handleUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      const res = await apiRequest("POST", "/api/marathons/refresh");
      const body = (await res.json()) as { data: { status: string; message?: string } };
      const status = body?.data?.status;
      if (status === "started") {
        toast({ title: t("common.fetchingLatest"), duration: 1500 });
        queryClient.invalidateQueries({ queryKey: ["/api/marathons/sync-status"] });
      } else if (status === "in_progress") {
        toast({ title: t("common.syncInProgress"), duration: 1500 });
        queryClient.invalidateQueries({ queryKey: ["/api/marathons/sync-status"] });
      } else {
        toast({ title: body?.data?.message ?? t("common.tryAgainLater"), duration: 1500 });
        setIsUpdating(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("common.updateFailed");
      const match = message.match(/^(\d+):\s*(.*)$/);
      if (match && match[1] === "429") {
        try {
          const payload = JSON.parse(match[2]) as { data?: { message?: string } };
          toast({ title: payload?.data?.message ?? t("common.tryAgainLater"), duration: 1500 });
        } catch {
          toast({ title: t("common.tryAgainLater"), duration: 1500 });
        }
      } else {
        toast({ title: t("common.updateFailed"), description: message, duration: 2000 });
      }
      setIsUpdating(false);
    }
  };

  const handleToggleMine = () => {
    if (viewMode === "mine") {
      setViewMode("all");
      return;
    }
    if (!currentUser) {
      toast({
        title: t("common.loginRequired"),
        description: t("common.loginRequiredHint"),
        duration: 1000,
      });
      return;
    }
    setViewMode("mine");
  };

  const clearFilters = () => {
    setMonthFilter("all");
    setStatusFilter("all");
    setCountryFilter("all");
    setSortBy("raceDate");
    setSortOrder("asc");
    setSearchQuery("");
  };

  const toggleLanguage = () => {
    const next = i18n.language?.startsWith("en") ? "zh" : "en";
    void i18n.changeLanguage(next);
  };
  const otherLangLabel = i18n.language?.startsWith("en") ? "中" : "EN";

  const monthSuffix = t("filters.monthSuffix");
  const renderMonthOption = (m: number) =>
    monthSuffix ? `${m} ${monthSuffix}` : String(m);
  const monthBadge = monthFilter !== "all"
    ? (monthSuffix ? `${monthFilter} ${monthSuffix}` : `${monthFilter}`)
    : null;

  const statusBadgeLabel = (raw: string) =>
    STATUS_KEY[raw] ? t(STATUS_KEY[raw]) : raw;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 glass-header border-b">
        <div className="max-w-2xl mx-auto px-4">
          <div className="h-12 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src="/favicon.svg"
                alt=""
                className="w-6 h-6 rounded-md shrink-0"
              />
              <div className="flex flex-col min-w-0 leading-tight">
                <h1 className="text-base font-semibold truncate" data-testid="text-app-title">
                  {t("app.title")}
                </h1>
                {(lastUpdatedText || syncStatus?.isRunning) && (
                  <span
                    className="text-[10px] text-muted-foreground truncate"
                    data-testid="text-last-updated"
                  >
                    {syncStatus?.isRunning ? t("header.lastUpdated.syncing") : lastUpdatedText}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <div
                className="h-8 inline-flex items-center rounded-lg bg-secondary/40 p-0.5"
                role="group"
                aria-label={t("tabs.kindMarathon") + " / " + t("tabs.kindTrail")}
              >
                <button
                  className={`h-7 px-2 rounded-md inline-flex items-center gap-1 text-xs font-medium transition-colors ${
                    kind === "marathon"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setKind("marathon")}
                  data-testid="button-kind-marathon"
                  aria-pressed={kind === "marathon"}
                  title={t("tabs.kindMarathon")}
                >
                  <Footprints className="w-[14px] h-[14px]" />
                  <span className="hidden sm:inline">{t("tabs.kindMarathon")}</span>
                </button>
                <button
                  className={`h-7 px-2 rounded-md inline-flex items-center gap-1 text-xs font-medium transition-colors ${
                    kind === "trail"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setKind("trail")}
                  data-testid="button-kind-trail"
                  aria-pressed={kind === "trail"}
                  title={t("tabs.kindTrail")}
                >
                  <Mountain className="w-[14px] h-[14px]" />
                  <span className="hidden sm:inline">{t("tabs.kindTrail")}</span>
                </button>
              </div>
              <button
                className="h-8 px-2 rounded-lg flex items-center justify-center text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                onClick={toggleLanguage}
                data-testid="button-language-toggle"
                title={i18n.language?.startsWith("en") ? "切换到中文" : "Switch to English"}
                aria-label={i18n.language?.startsWith("en") ? "切换到中文" : "Switch to English"}
                aria-pressed={i18n.language?.startsWith("en")}
              >
                {otherLangLabel}
              </button>
              <Link href="/my-favorites">
                <button
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                  data-testid="link-my-favorites"
                  title={t("header.myFavorites")}
                >
                  <Heart className="w-[18px] h-[18px]" />
                </button>
              </Link>
              <Link href="/my-reviews">
                <button
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                  data-testid="link-my-reviews"
                  title={t("header.myReviews")}
                >
                  <MessageSquare className="w-[18px] h-[18px]" />
                </button>
              </Link>
              <Link href="/profile">
                <button
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                  data-testid="link-profile"
                  title={t("header.profile")}
                >
                  <User className="w-[18px] h-[18px]" />
                </button>
              </Link>
              <button
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                onClick={handleUpdate}
                disabled={isUpdating}
                data-testid="button-refresh"
                title={t("header.refresh")}
              >
                <RefreshCw className={`w-[18px] h-[18px] ${isUpdating ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <Tabs
            value={region}
            onValueChange={(value) => setRegion(value as "China" | "Overseas" | "WMM")}
            className="flex-1"
          >
            <TabsList className="grid w-full grid-cols-3 bg-secondary/50 rounded-xl p-1 h-9">
              <TabsTrigger
                value="China"
                className="rounded-lg text-sm h-7 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                data-testid="tab-china"
              >
                {t("tabs.china")}
              </TabsTrigger>
              <TabsTrigger
                value="Overseas"
                className="rounded-lg text-sm h-7 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                data-testid="tab-overseas"
              >
                {t("tabs.overseas")}
              </TabsTrigger>
              <TabsTrigger
                value="WMM"
                className="rounded-lg text-sm h-7 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                data-testid="tab-wmm"
              >
                {t("tabs.wmm")}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <button
            className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center transition-colors ${
              viewMode === "mine"
                ? "bg-red-500/10 text-red-500"
                : "bg-secondary/40 text-muted-foreground hover:text-foreground"
            }`}
            onClick={handleToggleMine}
            data-testid="button-toggle-mine"
            title={viewMode === "mine" ? t("tabs.showAll") : t("tabs.showFavorites")}
          >
            <Heart className={`w-[18px] h-[18px] ${viewMode === "mine" ? "fill-current" : ""}`} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            className={`h-8 px-3 rounded-full text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
              filtersOpen || hasActiveFilters
                ? "bg-primary/10 text-primary"
                : "bg-secondary/40 text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setFiltersOpen(!filtersOpen)}
            data-testid="button-toggle-filters"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {t("filters.title")}
            {hasActiveFilters && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </button>
          {hasActiveFilters && (
            <button
              className="h-8 px-2.5 rounded-full text-xs text-muted-foreground hover:text-foreground bg-secondary/40 inline-flex items-center gap-1 transition-colors"
              onClick={clearFilters}
              data-testid="button-clear-filters"
            >
              <X className="w-3 h-3" />
              {t("filters.clear")}
            </button>
          )}
          {hasActiveFilters && !filtersOpen && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground overflow-x-auto">
              {searchQuery && (
                <span className="shrink-0 bg-secondary/50 px-2 py-0.5 rounded-full">{searchQuery}</span>
              )}
              {monthBadge && (
                <span className="shrink-0 bg-secondary/50 px-2 py-0.5 rounded-full">{monthBadge}</span>
              )}
              {statusFilter !== "all" && (
                <span className="shrink-0 bg-secondary/50 px-2 py-0.5 rounded-full">{statusBadgeLabel(statusFilter)}</span>
              )}
              {countryFilter !== "all" && (
                <span className="shrink-0 bg-secondary/50 px-2 py-0.5 rounded-full">{countryFilter}</span>
              )}
              {sortBy !== "raceDate" && (
                <span className="shrink-0 bg-secondary/50 px-2 py-0.5 rounded-full">
                  {sortBy === "name" ? t("filters.byName") : t("filters.byLatest")}
                </span>
              )}
            </div>
          )}
        </div>

        <AnimatePresence>
          {filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="rounded-2xl border bg-card p-3 space-y-2.5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder={t("filters.search")}
                    className="pl-9 bg-secondary/30 border-0 rounded-xl h-9 text-sm focus-visible:ring-1 focus-visible:ring-primary/20"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    data-testid="input-search"
                  />
                </div>

                {region !== "China" && countries.length > 1 && (
                  <Select value={countryFilter} onValueChange={setCountryFilter}>
                    <SelectTrigger className="bg-secondary/30 border-0 rounded-xl h-9 text-sm" data-testid="select-country">
                      <SelectValue placeholder={t("filters.country")} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="all">{t("filters.allCountries")}</SelectItem>
                      {countries.map((c) => (
                        <SelectItem key={c.country} value={c.country} data-testid={`option-country-${c.country}`}>
                          {c.country} ({c.count})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <Select value={monthFilter} onValueChange={setMonthFilter}>
                    <SelectTrigger className="bg-secondary/30 border-0 rounded-xl h-9 text-sm" data-testid="select-month">
                      <SelectValue placeholder={t("filters.month")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("filters.allMonths")}</SelectItem>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={`${i + 1}`}>
                          {renderMonthOption(i + 1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="bg-secondary/30 border-0 rounded-xl h-9 text-sm" data-testid="select-status">
                      <SelectValue placeholder={t("filters.status")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("filters.allStatuses")}</SelectItem>
                      <SelectItem value="upcoming">{t("status.upcoming")}</SelectItem>
                      <SelectItem value="open">{t("status.open")}</SelectItem>
                      <SelectItem value="closed">{t("status.closed")}</SelectItem>
                      <SelectItem value="racing">{t("status.racing")}</SelectItem>
                      <SelectItem value="ended">{t("status.ended")}</SelectItem>
                      <SelectItem value="cancelled">{t("status.cancelled")}</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex gap-1.5">
                    <Select value={sortBy} onValueChange={(value) => setSortBy(value as "raceDate" | "name" | "createdAt")}>
                      <SelectTrigger className="bg-secondary/30 border-0 rounded-xl h-9 text-sm flex-1" data-testid="select-sort">
                        <SelectValue placeholder={t("filters.sort")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="raceDate">{t("filters.sortByDate")}</SelectItem>
                        <SelectItem value="name">{t("filters.sortByName")}</SelectItem>
                        <SelectItem value="createdAt">{t("filters.sortByLatest")}</SelectItem>
                      </SelectContent>
                    </Select>

                    <button
                      className="w-9 h-9 shrink-0 rounded-xl bg-secondary/30 flex items-center justify-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                      data-testid="button-sort-order"
                      title={sortOrder === "asc" ? t("filters.sortAsc") : t("filters.sortDesc")}
                    >
                      {sortOrder === "asc" ? "↑" : "↓"}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-4">
        <MarathonTable
          region={region}
          searchQuery={searchQuery}
          filters={{
            year: currentYear,
            month: monthFilter === "all" ? undefined : Number(monthFilter),
            status: statusFilter === "all" ? undefined : statusFilter,
            country: countryFilter === "all" ? undefined : countryFilter,
            kind,
            sortBy,
            sortOrder,
          }}
          showMineOnly={viewMode === "mine"}
          favoriteMarathonIds={favoriteMarathonIds}
          favoritesLoading={isFavoritesLoading}
        />
      </main>
      <Footer />
    </div>
  );
}
