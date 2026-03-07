import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { Search, RefreshCw, Map } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MarathonTable } from "@/components/MarathonTable";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser, useMyFavorites } from "@/hooks/useAuth";
import { motion, useScroll, useTransform } from "framer-motion";

export default function Home() {
  const [region, setRegion] = useState<"China" | "Overseas">("China");
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  const { scrollY } = useScroll();

  const { data: currentUser } = useCurrentUser();
  const { data: favorites = [], isLoading: isFavoritesLoading } = useMyFavorites(!!currentUser);

  const favoriteMarathonIds = useMemo(
    () => new Set(favorites.map((item) => item.marathon.id)),
    [favorites],
  );

  const currentYear = new Date().getFullYear();

  const headerBlur = useTransform(scrollY, [0, 100], [0, 20]);
  const headerBorder = useTransform(scrollY, [0, 100], ["rgba(0,0,0,0)", "rgba(0,0,0,0.05)"]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      toast({
        title: "数据已同步",
        description: "已获取最新赛事状态",
      });
    }, 1200);
  };

  return (
    <div className="min-h-screen selection:bg-blue-500/20">
      <motion.header
        style={{ backdropFilter: `blur(${headerBlur}px)`, borderBottomColor: headerBorder }}
        className="sticky top-0 z-50 w-full glass-effect border-b transition-colors duration-500"
      >
        <div className="container max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Map className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight leading-none">马拉松日历</h1>
              <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-blue-500/80">Global Calendar</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/profile">
              <Button variant="ghost" size="sm" className="rounded-full text-xs font-medium h-8">
                个人
              </Button>
            </Link>
            <Link href="/my-favorites">
              <Button variant="ghost" size="sm" className="rounded-full text-xs font-medium h-8">
                收藏
              </Button>
            </Link>
            <Link href="/my-reviews">
              <Button variant="ghost" size="sm" className="rounded-full text-xs font-medium h-8">
                评论
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              className="rounded-full hover:bg-secondary transition-all active:scale-90 h-8 w-8"
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin text-blue-500" : "text-muted-foreground/60"}`} />
            </Button>
          </div>
        </div>
      </motion.header>

      <main className="container max-w-6xl mx-auto px-6 pt-12 pb-24">
        <section className="mb-16">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="text-5xl md:text-7xl font-black tracking-tighter mb-4 leading-[0.9]">
              下一个征程，<br />
              <span className="text-muted-foreground/30">从这里开始。</span>
            </h2>
          </motion.div>
        </section>

        <div className="sticky top-[72px] z-40 mb-12">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="p-1.5 bg-secondary/80 backdrop-blur-2xl rounded-2xl border flex shadow-2xl shadow-black/[0.02]">
              {[
                { id: "China", label: "中国境内" },
                { id: "Overseas", label: "全球海外" }
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setRegion(opt.id as any)}
                  className={`relative px-8 py-2.5 rounded-[14px] text-sm font-bold transition-all duration-500 ${
                    region === opt.id
                    ? "text-blue-500"
                    : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {region === opt.id && (
                    <motion.div
                      layoutId="active-tab"
                      className="absolute inset-0 bg-white dark:bg-zinc-800 rounded-[14px] shadow-sm"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10">{opt.label}</span>
                </button>
              ))}
            </div>

            <div className="relative flex-1 group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 group-focus-within:text-blue-500 transition-colors duration-500" />
              <Input
                placeholder="搜索赛事名称或城市..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 bg-secondary/80 border-transparent focus:bg-white dark:focus:bg-zinc-900 focus:ring-[6px] focus:ring-blue-500/5 rounded-2xl transition-all duration-500 placeholder:text-muted-foreground/30 shadow-2xl shadow-black/[0.02]"
              />
            </div>
          </div>
        </div>

        <MarathonTable
          region={region}
          searchQuery={searchQuery}
          filters={{
            year: currentYear,
            sortBy: "raceDate",
            sortOrder: "asc",
          }}
          favoriteMarathonIds={favoriteMarathonIds}
        />
      </main>
    </div>
  );
}
