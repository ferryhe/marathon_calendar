import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Search, RefreshCw, Map } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Map className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-base font-bold tracking-tight">马拉松日历</h1>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/profile">
              <Button variant="ghost" size="sm" className="rounded-full text-xs h-8 px-3">个人</Button>
            </Link>
            <Link href="/my-favorites">
              <Button variant="ghost" size="sm" className="rounded-full text-xs h-8 px-3">收藏</Button>
            </Link>
            <Link href="/my-reviews">
              <Button variant="ghost" size="sm" className="rounded-full text-xs h-8 px-3">评论</Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              className="rounded-full h-8 w-8 active:scale-90"
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin text-blue-500" : "text-muted-foreground/50"}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 pt-8 pb-20">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl font-bold tracking-tight mb-8"
        >
          发现你的下一场比赛
        </motion.p>

        <div className="sticky top-[60px] z-40 pb-5 -mx-5 px-5 glass-effect">
          <div className="flex gap-3 items-center">
            <div className="p-1 bg-secondary/60 rounded-xl flex shrink-0">
              {[
                { id: "China", label: "国内" },
                { id: "Overseas", label: "海外" }
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setRegion(opt.id as any)}
                  className={`relative px-5 py-2 rounded-lg text-[13px] font-semibold transition-all ${
                    region === opt.id
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {region === opt.id && (
                    <motion.div
                      layoutId="active-tab"
                      className="absolute inset-0 bg-white dark:bg-zinc-800 rounded-lg shadow-sm"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                    />
                  )}
                  <span className="relative z-10">{opt.label}</span>
                </button>
              ))}
            </div>

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
              <Input
                placeholder="搜索赛事或城市..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 bg-secondary/60 border-0 rounded-xl text-sm placeholder:text-muted-foreground/30 focus-visible:ring-1 focus-visible:ring-blue-500/30"
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
