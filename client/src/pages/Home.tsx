import { useState, useEffect, useMemo } from "react";
import { Search, RefreshCw, Map } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MarathonTable } from "@/components/MarathonTable";
import { useToast } from "@/hooks/use-toast";
import { motion, useScroll, useTransform } from "framer-motion";

export default function Home() {
  const [region, setRegion] = useState<"China" | "Overseas">("China");
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  const { scrollY } = useScroll();
  
  const headerOpacity = useTransform(scrollY, [0, 50], [1, 0.8]);
  const headerBlur = useTransform(scrollY, [0, 50], [0, 8]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      toast({
        title: "数据已更新",
        description: "已同步最新马拉松赛事信息",
        duration: 3000,
      });
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#FBFBFD] dark:bg-[#000000] text-[#1D1D1F] dark:text-[#F5F5F7]">
      {/* Dynamic Navigation Bar */}
      <motion.header 
        style={{ opacity: headerOpacity }}
        className="sticky top-0 z-50 w-full border-b border-black/[0.05] dark:border-white/[0.05] glass-effect"
      >
        <div className="container max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Map className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Global Marathon</h1>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleRefresh}
            className="rounded-full hover:bg-secondary/80 transition-all active:scale-90"
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-5 w-5 ${isRefreshing ? "animate-spin text-blue-500" : "text-muted-foreground"}`} />
          </Button>
        </div>
      </motion.header>

      <main className="container max-w-5xl mx-auto px-4 pt-16 pb-24">
        {/* Hero Section */}
        <section className="mb-20 text-center">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-7xl font-black tracking-tighter mb-6 bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent"
          >
            跑遍全球。
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-muted-foreground text-xl md:text-2xl max-w-2xl mx-auto font-medium"
          >
            为您精心挑选中国及海外顶尖马拉松赛事，开启您的下一个征程。
          </motion.p>
        </section>

        {/* Sticky Controls */}
        <div className="sticky top-[72px] z-40 mb-16 space-y-6">
          <div className="flex flex-col md:flex-row gap-6 items-center">
            {/* Region Toggle */}
            <div className="inline-flex p-1.5 bg-secondary/40 backdrop-blur-xl rounded-[2rem] border border-black/[0.03] dark:border-white/[0.03] w-full md:w-auto shadow-inner">
              <button
                onClick={() => setRegion("China")}
                className={`flex-1 md:flex-none px-10 py-3 rounded-[1.5rem] text-sm font-bold transition-all duration-500 ${
                  region === "China" 
                  ? "bg-white dark:bg-zinc-800 shadow-2xl shadow-black/10 text-blue-500 scale-[1.02]" 
                  : "text-muted-foreground hover:text-foreground"
                }`}
              >
                中国境内
              </button>
              <button
                onClick={() => setRegion("Overseas")}
                className={`flex-1 md:flex-none px-10 py-3 rounded-[1.5rem] text-sm font-bold transition-all duration-500 ${
                  region === "Overseas" 
                  ? "bg-white dark:bg-zinc-800 shadow-2xl shadow-black/10 text-blue-500 scale-[1.02]" 
                  : "text-muted-foreground hover:text-foreground"
                }`}
              >
                全球海外
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 w-full group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-blue-500 transition-colors duration-300" />
              <Input
                placeholder="搜索赛事名称或城市..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-14 h-16 bg-secondary/40 border-transparent focus:bg-white dark:focus:bg-zinc-900 focus:ring-[6px] focus:ring-blue-500/10 rounded-[2rem] text-lg transition-all duration-500 shadow-inner"
              />
            </div>
          </div>
        </div>

        {/* Content Section */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <MarathonTable region={region} searchQuery={searchQuery} />
        </motion.div>
      </main>
    </div>
  );
}
