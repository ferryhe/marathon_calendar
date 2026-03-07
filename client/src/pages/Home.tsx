import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Heart, MessageSquare, RefreshCw, Search, SlidersHorizontal, User, X } from "lucide-react";
import { MarathonTable } from "@/components/MarathonTable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser, useMyFavorites } from "@/hooks/useAuth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";

export default function Home() {
  const [region, setRegion] = useState<"China" | "Overseas">("China");
  const [searchQuery, setSearchQuery] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"raceDate" | "name" | "createdAt">("raceDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<"all" | "mine">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { toast } = useToast();

  const { data: currentUser } = useCurrentUser();
  const { data: favorites = [], isLoading: isFavoritesLoading } = useMyFavorites(!!currentUser);

  const favoriteMarathonIds = useMemo(
    () => new Set(favorites.map((item) => item.marathon.id)),
    [favorites],
  );

  const currentYear = new Date().getFullYear();

  const hasActiveFilters =
    monthFilter !== "all" ||
    statusFilter !== "all" ||
    sortBy !== "raceDate" ||
    searchQuery !== "";

  useEffect(() => {
    if (!currentUser && viewMode === "mine") {
      setViewMode("all");
    }
  }, [currentUser, viewMode]);

  useEffect(() => {
    document.title = viewMode === "mine" ? "我的收藏 - 马拉松日历" : "马拉松日历";
  }, [viewMode]);

  const handleUpdate = () => {
    setIsUpdating(true);
    setTimeout(() => {
      setIsUpdating(false);
      toast({
        title: "已更新",
        duration: 1000,
      });
    }, 800);
  };

  const handleToggleMine = () => {
    if (viewMode === "mine") {
      setViewMode("all");
      return;
    }
    if (!currentUser) {
      toast({
        title: "请先登录",
        description: "登录后可查看收藏赛事",
        duration: 1000,
      });
      return;
    }
    setViewMode("mine");
  };

  const clearFilters = () => {
    setMonthFilter("all");
    setStatusFilter("all");
    setSortBy("raceDate");
    setSortOrder("asc");
    setSearchQuery("");
  };

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
              <h1 className="text-base font-semibold truncate" data-testid="text-app-title">
                马拉松日历
              </h1>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Link href="/my-favorites">
                <button
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                  data-testid="link-my-favorites"
                  title="我的收藏"
                >
                  <Heart className="w-[18px] h-[18px]" />
                </button>
              </Link>
              <Link href="/my-reviews">
                <button
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                  data-testid="link-my-reviews"
                  title="我的评论"
                >
                  <MessageSquare className="w-[18px] h-[18px]" />
                </button>
              </Link>
              <Link href="/profile">
                <button
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                  data-testid="link-profile"
                  title="个人资料"
                >
                  <User className="w-[18px] h-[18px]" />
                </button>
              </Link>
              <button
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                onClick={handleUpdate}
                disabled={isUpdating}
                data-testid="button-refresh"
                title="刷新数据"
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
            onValueChange={(value) => setRegion(value as "China" | "Overseas")}
            className="flex-1"
          >
            <TabsList className="grid w-full grid-cols-2 bg-secondary/50 rounded-xl p-1 h-9">
              <TabsTrigger
                value="China"
                className="rounded-lg text-sm h-7 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                data-testid="tab-china"
              >
                国内赛事
              </TabsTrigger>
              <TabsTrigger
                value="Overseas"
                className="rounded-lg text-sm h-7 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                data-testid="tab-overseas"
              >
                海外赛事
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
            title={viewMode === "mine" ? "显示全部赛事" : "只看收藏"}
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
            筛选
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
              清除
            </button>
          )}
          {hasActiveFilters && !filtersOpen && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground overflow-x-auto">
              {searchQuery && (
                <span className="shrink-0 bg-secondary/50 px-2 py-0.5 rounded-full">{searchQuery}</span>
              )}
              {monthFilter !== "all" && (
                <span className="shrink-0 bg-secondary/50 px-2 py-0.5 rounded-full">{monthFilter}月</span>
              )}
              {statusFilter !== "all" && (
                <span className="shrink-0 bg-secondary/50 px-2 py-0.5 rounded-full">{statusFilter}</span>
              )}
              {sortBy !== "raceDate" && (
                <span className="shrink-0 bg-secondary/50 px-2 py-0.5 rounded-full">
                  {sortBy === "name" ? "按名称" : "按最新"}
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
                    placeholder="搜索赛事名称或城市..."
                    className="pl-9 bg-secondary/30 border-0 rounded-xl h-9 text-sm focus-visible:ring-1 focus-visible:ring-primary/20"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    data-testid="input-search"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Select value={monthFilter} onValueChange={setMonthFilter}>
                    <SelectTrigger className="bg-secondary/30 border-0 rounded-xl h-9 text-sm" data-testid="select-month">
                      <SelectValue placeholder="月份" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部月份</SelectItem>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={`${i + 1}`}>
                          {i + 1} 月
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="bg-secondary/30 border-0 rounded-xl h-9 text-sm" data-testid="select-status">
                      <SelectValue placeholder="状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态</SelectItem>
                      <SelectItem value="报名中">报名中</SelectItem>
                      <SelectItem value="即将开始">即将开始</SelectItem>
                      <SelectItem value="已截止">已截止</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex gap-1.5">
                    <Select value={sortBy} onValueChange={(value) => setSortBy(value as "raceDate" | "name" | "createdAt")}>
                      <SelectTrigger className="bg-secondary/30 border-0 rounded-xl h-9 text-sm flex-1" data-testid="select-sort">
                        <SelectValue placeholder="排序" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="raceDate">按时间</SelectItem>
                        <SelectItem value="name">按名称</SelectItem>
                        <SelectItem value="createdAt">按最新</SelectItem>
                      </SelectContent>
                    </Select>

                    <button
                      className="w-9 h-9 shrink-0 rounded-xl bg-secondary/30 flex items-center justify-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                      data-testid="button-sort-order"
                      title={sortOrder === "asc" ? "升序" : "降序"}
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
            sortBy,
            sortOrder,
          }}
          showMineOnly={viewMode === "mine"}
          favoriteMarathonIds={favoriteMarathonIds}
          favoritesLoading={isFavoritesLoading}
        />
      </main>
    </div>
  );
}
