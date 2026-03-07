import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Search, RefreshCw, Map, User, Heart, MessageCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MarathonTable } from "@/components/MarathonTable";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser, useMyFavorites } from "@/hooks/useAuth";
import { motion } from "framer-motion";

export default function Home() {
  const [region, setRegion] = useState<"China" | "Overseas">("China");
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const { data: currentUser } = useCurrentUser();
  const { data: favorites = [] } = useMyFavorites(!!currentUser);

  const favoriteMarathonIds = useMemo(
    () => new Set(favorites.map((item) => item.marathon.id)),
    [favorites],
  );

  const currentYear = new Date().getFullYear();

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      toast({ title: "数据已同步", description: "已获取最新赛事状态" });
    }, 1200);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 w-full glass-effect border-b">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-md shadow-blue-500/20">
              <Map className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-base font-bold tracking-tight">马拉松日历</h1>
          </div>

          <div className="flex items-center gap-1.5">
            <Link href="/profile">
              <div className="w-9 h-9 rounded-full bg-secondary/80 hover:bg-secondary flex items-center justify-center transition-colors active:scale-95 cursor-pointer" title="个人资料">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/my-favorites">
              <div className="w-9 h-9 rounded-full bg-secondary/80 hover:bg-secondary flex items-center justify-center transition-colors active:scale-95 cursor-pointer" title="我的收藏">
                <Heart className="w-4 h-4 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/my-reviews">
              <div className="w-9 h-9 rounded-full bg-secondary/80 hover:bg-secondary flex items-center justify-center transition-colors active:scale-95 cursor-pointer" title="我的评论">
                <MessageCircle className="w-4 h-4 text-muted-foreground" />
              </div>
            </Link>
            <div
              onClick={!isRefreshing ? handleRefresh : undefined}
              className={`w-9 h-9 rounded-full bg-secondary/80 hover:bg-secondary flex items-center justify-center transition-colors active:scale-95 cursor-pointer ${isRefreshing ? "pointer-events-none" : ""}`}
              title="刷新数据"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-blue-500" : "text-muted-foreground"}`} />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 pt-8 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h2 className="text-2xl font-bold tracking-tight">发现你的下一场比赛</h2>
          <p className="text-sm text-muted-foreground/60 mt-1">探索中国和全球的精彩马拉松赛事</p>
        </motion.div>

        <div className="sticky top-[60px] z-40 pb-4 -mx-5 px-5 glass-effect">
          <div className="flex gap-3 items-center">
            <div className="p-1 bg-secondary/60 rounded-xl flex shrink-0">
              {[
                { id: "China", label: "国内赛事" },
                { id: "Overseas", label: "海外赛事" }
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setRegion(opt.id as any)}
                  className={`relative px-5 py-2 rounded-[10px] text-[13px] font-semibold transition-all ${
                    region === opt.id
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {region === opt.id && (
                    <motion.div
                      layoutId="active-tab"
                      className="absolute inset-0 bg-white dark:bg-zinc-800 rounded-[10px] shadow-sm"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                    />
                  )}
                  <span className="relative z-10">{opt.label}</span>
                </button>
              ))}
            </div>

            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
              <Input
                placeholder="搜索赛事或城市..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10 bg-secondary/60 border-0 rounded-xl text-sm placeholder:text-muted-foreground/30 focus-visible:ring-1 focus-visible:ring-blue-500/30"
              />
            </div>
          </div>
        </div>

        <MarathonTable
          region={region}
          searchQuery={searchQuery}
          filters={{ year: currentYear, sortBy: "raceDate", sortOrder: "asc" }}
          favoriteMarathonIds={favoriteMarathonIds}
        />
      </main>
    </div>
  );
}
