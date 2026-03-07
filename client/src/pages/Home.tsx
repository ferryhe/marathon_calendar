import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Search, User, Heart, MessageSquare } from "lucide-react";
import { MarathonTable } from "@/components/MarathonTable";
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

export default function Home() {
  const [region, setRegion] = useState<"China" | "Overseas">("China");
  const [searchQuery, setSearchQuery] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"raceDate" | "name">("raceDate");
  const [viewMode, setViewMode] = useState<"all" | "mine">("all");
  const { toast } = useToast();

  const { data: currentUser } = useCurrentUser();
  const { data: favorites = [], isLoading: isFavoritesLoading } = useMyFavorites(!!currentUser);

  const favoriteMarathonIds = useMemo(
    () => new Set(favorites.map((item) => item.marathon.id)),
    [favorites],
  );

  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (!currentUser && viewMode === "mine") {
      setViewMode("all");
    }
  }, [currentUser, viewMode]);

  const handleUpdate = () => {
    setIsUpdating(true);
    setTimeout(() => {
      setIsUpdating(false);
      toast({
        title: "日历已更新",
        description: "已从网络获取最新马拉松赛事信息。",
        duration: 3000,
      });
    }, 1500);
  };

  const handleMineMode = () => {
    if (!currentUser) {
      toast({
        title: "请先登录",
        description: '登录后可查看"我的比赛"（收藏赛事）。',
        duration: 2500,
      });
      return;
    }
    setViewMode("mine");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 glass-header border-b">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between h-12">
            <h1 className="text-base font-semibold inline-flex items-center gap-1.5" data-testid="text-app-title">
              <span className="text-base">🏃</span>
              马拉松日历
            </h1>

            <div className="flex items-center gap-1">
              <Link href="/my-favorites">
                <button
                  className="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  data-testid="link-favorites"
                >
                  <Heart className="w-4 h-4" />
                </button>
              </Link>
              <Link href="/my-reviews">
                <button
                  className="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  data-testid="link-reviews"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
              </Link>
              <Link href="/profile">
                <button
                  className="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  data-testid="link-profile"
                >
                  <User className="w-4 h-4" />
                </button>
              </Link>
              <button
                onClick={handleUpdate}
                disabled={isUpdating}
                className="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                data-testid="button-refresh"
              >
                <RefreshCw className={`w-4 h-4 ${isUpdating ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <div className="pb-3 space-y-3">
            <div className="relative" data-testid="region-toggle">
              <div className="flex bg-secondary/50 rounded-xl p-1 relative">
                <motion.div
                  className="absolute top-1 bottom-1 rounded-lg bg-background shadow-sm"
                  layout
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  style={{
                    width: "calc(50% - 4px)",
                    left: region === "China" ? 4 : "calc(50% + 0px)",
                  }}
                />
                <button
                  className={`relative z-10 flex-1 py-1.5 text-sm font-medium text-center rounded-lg transition-colors ${
                    region === "China" ? "text-foreground" : "text-muted-foreground"
                  }`}
                  onClick={() => setRegion("China")}
                  data-testid="tab-china"
                >
                  国内赛事
                </button>
                <button
                  className={`relative z-10 flex-1 py-1.5 text-sm font-medium text-center rounded-lg transition-colors ${
                    region === "Overseas" ? "text-foreground" : "text-muted-foreground"
                  }`}
                  onClick={() => setRegion("Overseas")}
                  data-testid="tab-overseas"
                >
                  海外赛事
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="搜索赛事名称或城市..."
                className="pl-9 bg-secondary/30 border-0 rounded-xl h-10 text-sm focus-visible:ring-1 focus-visible:ring-primary/20"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                data-testid="input-search"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode("all")}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                  viewMode === "all"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                }`}
                data-testid="button-all"
              >
                全部
              </button>
              <button
                onClick={handleMineMode}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                  viewMode === "mine"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                }`}
                data-testid="button-mine"
              >
                我的{viewMode === "mine" ? ` (${favoriteMarathonIds.size})` : ""}
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              <div className="shrink-0 px-3 h-8 flex items-center rounded-full bg-secondary/30 text-sm text-muted-foreground">
                {currentYear}年
              </div>

              <Select value={monthFilter} onValueChange={setMonthFilter}>
                <SelectTrigger className="shrink-0 w-auto min-w-[5rem] bg-secondary/30 border-0 rounded-full h-8 text-sm" data-testid="select-month">
                  <SelectValue placeholder="全部月份" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部月份</SelectItem>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={`${i + 1}`}>
                      {i + 1}月
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="shrink-0 w-auto min-w-[5rem] bg-secondary/30 border-0 rounded-full h-8 text-sm" data-testid="select-status">
                  <SelectValue placeholder="报名状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="报名中">报名中</SelectItem>
                  <SelectItem value="即将开始">即将开始</SelectItem>
                  <SelectItem value="已截止">已截止</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(value) => setSortBy(value as "raceDate" | "name")}>
                <SelectTrigger className="shrink-0 w-auto min-w-[5rem] bg-secondary/30 border-0 rounded-full h-8 text-sm" data-testid="select-sort">
                  <SelectValue placeholder="排序" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="raceDate">按时间</SelectItem>
                  <SelectItem value="name">按名称</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${region}-${viewMode}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <MarathonTable
              region={region}
              searchQuery={searchQuery}
              filters={{
                year: currentYear,
                month: monthFilter === "all" ? undefined : Number(monthFilter),
                status: statusFilter === "all" ? undefined : statusFilter,
                sortBy,
              }}
              showMineOnly={viewMode === "mine"}
              favoriteMarathonIds={favoriteMarathonIds}
              favoritesLoading={isFavoritesLoading}
            />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
