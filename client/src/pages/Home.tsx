import { useState } from "react";
import { MarathonTable } from "@/components/MarathonTable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
  const { toast } = useToast();

  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;

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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 glass border-b">
        <div className="container mx-auto px-4 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">马拉松日历</h1>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleUpdate} 
              disabled={isUpdating}
              className="rounded-full"
            >
              <RefreshCw className={`h-5 w-5 ${isUpdating ? "animate-spin" : ""}`} />
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="搜索赛事名称或城市..."
                className="pl-9 bg-secondary/30 border-0 rounded-xl h-11 focus-visible:ring-1 focus-visible:ring-primary/20"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <Tabs 
              value={region} 
              onValueChange={(v) => setRegion(v as "China" | "Overseas")} 
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 bg-secondary/50 rounded-xl p-1">
                <TabsTrigger value="China" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">国内赛事</TabsTrigger>
                <TabsTrigger value="Overseas" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">海外赛事</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-secondary/30 rounded-xl h-10 px-3 flex items-center text-sm text-muted-foreground">
                {currentYear} 年
              </div>

              <Select value={monthFilter} onValueChange={setMonthFilter}>
                <SelectTrigger className="bg-secondary/30 border-0 rounded-xl h-10">
                  <SelectValue placeholder="全部月份" />
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
                <SelectTrigger className="bg-secondary/30 border-0 rounded-xl h-10">
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
                <SelectTrigger className="bg-secondary/30 border-0 rounded-xl h-10">
                  <SelectValue placeholder="排序方式" />
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

      <main className="container mx-auto px-4 py-6">
        <MarathonTable
          region={region}
          searchQuery={searchQuery}
          filters={{
            year: currentYear,
            fallbackYear: nextYear,
            month: monthFilter === "all" ? undefined : Number(monthFilter),
            status: statusFilter === "all" ? undefined : statusFilter,
            sortBy,
          }}
        />
      </main>
    </div>
  );
}
