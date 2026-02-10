import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, ChevronRight, Loader2, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMarathons } from "@/hooks/useMarathons";
import { EventDetails } from "./EventDetails";
import type { MarathonListItem } from "@/lib/apiClient";

interface MarathonTableProps {
  region: "China" | "Overseas";
  searchQuery: string;
  filters: {
    year: number;
    month?: number;
    status?: string;
    sortBy: "raceDate" | "name";
  };
  showMineOnly?: boolean;
  favoriteMarathonIds?: Set<string>;
  favoritesLoading?: boolean;
}

interface MarathonWithDate extends MarathonListItem {
  displayDate: Date;
  year: number;
  month: number;
  day: number;
  registrationStatus: string;
}

function getStatusBadgeStyle(status: string) {
  if (status === "报名中") {
    return "bg-blue-500 hover:bg-blue-600 border-0 text-[10px] px-2 h-5";
  }
  if (status === "即将开始") {
    return "bg-amber-500 hover:bg-amber-600 border-0 text-[10px] px-2 h-5";
  }
  if (status === "已截止") {
    return "bg-muted text-muted-foreground border-0 text-[10px] px-2 h-5";
  }
  return "bg-muted text-muted-foreground border-0 text-[10px] px-2 h-5";
}

export function MarathonTable({
  region,
  searchQuery,
  filters,
  showMineOnly = false,
  favoriteMarathonIds = new Set<string>(),
  favoritesLoading = false,
}: MarathonTableProps) {
  const [selectedEvent, setSelectedEvent] = useState<MarathonListItem | null>(null);
  const country = region === "China" ? "China" : undefined;

  const { data, isLoading, error } = useMarathons({
    country,
    search: searchQuery || undefined,
    limit: 100,
    year: filters.year,
    month: filters.month,
    status: filters.status,
    sortBy: filters.sortBy,
    sortOrder: "asc",
  });

  const groupedEvents = useMemo(() => {
    if (!data?.data) return {} as Record<string, MarathonWithDate[]>;

    const events = data.data
      .filter((marathon) => {
        if (region === "Overseas" && marathon.country === "China") {
          return false;
        }
        if (showMineOnly && !favoriteMarathonIds.has(marathon.id)) {
          return false;
        }
        return true;
      })
      .map((marathon) => {
        const editionDate = marathon.nextEdition?.raceDate;
        const displayDate = editionDate ? new Date(editionDate) : new Date(marathon.createdAt);

        return {
          ...marathon,
          displayDate,
          year: displayDate.getFullYear(),
          month: displayDate.getMonth() + 1,
          day: displayDate.getDate(),
          registrationStatus: marathon.nextEdition?.registrationStatus ?? "待更新",
        } as MarathonWithDate;
      })
      .sort((a, b) => a.displayDate.getTime() - b.displayDate.getTime());

    const groups: Record<string, MarathonWithDate[]> = {};
    for (const event of events) {
      const key = `${event.year}年${event.month}月`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    }

    return groups;
  }, [data, region, showMineOnly, favoriteMarathonIds]);

  if (isLoading || (showMineOnly && favoritesLoading)) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-24 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mb-4">
          <Calendar className="w-8 h-8 text-destructive" />
        </div>
        <p className="text-destructive font-medium">加载赛事数据失败</p>
        <p className="text-sm text-muted-foreground mt-2">{(error as Error).message}</p>
      </div>
    );
  }

  const hasData = Object.keys(groupedEvents).length > 0;
  const emptyTitle = showMineOnly ? "你还没有收藏赛事" : "未找到相关马拉松赛事";
  const emptyHint = showMineOnly
    ? "可在赛事详情或弹窗中点击“收藏赛事”后再查看"
    : searchQuery
      ? "尝试使用不同的搜索关键词"
      : "";

  return (
    <div className="space-y-12">
      <AnimatePresence mode="popLayout">
        {hasData ? (
          Object.entries(groupedEvents).map(([month, events]) => (
            <div key={month} className="relative grid grid-cols-1 md:grid-cols-[100px_1fr] gap-6">
              <div className="md:sticky md:top-44 h-fit">
                <div className="flex items-baseline gap-2 md:flex-col md:items-start md:gap-0">
                  <span className="text-3xl font-black tracking-tighter text-foreground/20 md:text-4xl">
                    {month.split("年")[1].replace("月", "")}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/50 md:mt-1">
                    {month.split("年")[0]}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {events.map((event, index) => {
                  const weekDay = ["日", "一", "二", "三", "四", "五", "六"][event.displayDate.getDay()];
                  return (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="group relative flex items-center justify-between p-4 bg-card hover:bg-accent/50 active:scale-[0.98] transition-all rounded-2xl border cursor-pointer"
                      onClick={() => setSelectedEvent(event)}
                      data-testid={`row-event-${event.id}`}
                    >
                      <div className="flex items-center gap-5">
                        <div className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-secondary/50 font-bold border border-border/50">
                          <span className="text-lg leading-none">{event.day}</span>
                          <span className="text-[10px] text-muted-foreground uppercase mt-1">周{weekDay}</span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-base line-clamp-1 group-hover:text-primary transition-colors">
                            {event.name}
                          </h3>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground font-medium">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{event.city || event.country || "待更新"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Badge variant="default" className={getStatusBadgeStyle(event.registrationStatus)}>
                          {event.registrationStatus}
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="py-24 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary mb-4">
              <Calendar className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-muted-foreground font-medium">{emptyTitle}</p>
            {emptyHint ? <p className="text-sm text-muted-foreground/60 mt-2">{emptyHint}</p> : null}
          </div>
        )}
      </AnimatePresence>

      <EventDetails
        event={selectedEvent}
        open={!!selectedEvent}
        onOpenChange={(open) => !open && setSelectedEvent(null)}
      />
    </div>
  );
}
