import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, MapPin, Calendar, Loader2 } from "lucide-react";
import { EventDetails } from "./EventDetails";
import { motion, AnimatePresence } from "framer-motion";
import { useMarathons } from "@/hooks/useMarathons";
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

export function MarathonTable({ region, searchQuery, filters }: MarathonTableProps) {
  const [selectedEvent, setSelectedEvent] = useState<MarathonListItem | null>(null);

  // Determine country filter based on region
  const country = region === "China" ? "China" : undefined;

  // Fetch marathons from API
  const { data, isLoading, error } = useMarathons({
    country,
    search: searchQuery || undefined,
    limit: 100, // Get more results for client-side grouping
    year: filters.year,
    month: filters.month,
    status: filters.status,
    sortBy: filters.sortBy,
    sortOrder: "asc",
  });

  // Group marathons by month using real race date when available.
  const groupedEvents = useMemo(() => {
    if (!data?.data) return {};

    const events = data.data
      .filter((marathon) => {
        // Additional client-side filtering for overseas events
        if (region === "Overseas") {
          return marathon.country !== "China";
        }
        return true;
      })
      .map((marathon) => {
        const editionDate = marathon.nextEdition?.raceDate;
        const displayDate = editionDate
          ? new Date(editionDate)
          : new Date(marathon.createdAt);

        return {
          ...marathon,
          displayDate,
          year: displayDate.getFullYear(),
          month: displayDate.getMonth() + 1,
          day: displayDate.getDate(),
          registrationStatus: marathon.nextEdition?.registrationStatus ?? "待更新",
        } as MarathonWithDate;
      })
      .sort((a, b) => {
        return a.displayDate.getTime() - b.displayDate.getTime();
      });

    // Group by year-month
    const groups: { [key: string]: MarathonWithDate[] } = {};
    events.forEach((event) => {
      const key = `${event.year}年${event.month}月`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });

    return groups;
  }, [data, region]);

  if (isLoading) {
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

  return (
    <div className="space-y-12">
      <AnimatePresence mode="popLayout">
        {Object.keys(groupedEvents).length > 0 ? (
          Object.entries(groupedEvents).map(([month, events]) => (
            <div key={month} className="relative grid grid-cols-1 md:grid-cols-[100px_1fr] gap-6">
              {/* Sticky Month Label */}
              <div className="md:sticky md:top-44 h-fit">
                <div className="flex items-baseline gap-2 md:flex-col md:items-start md:gap-0">
                  <span className="text-3xl font-black tracking-tighter text-foreground/20 md:text-4xl">
                    {month.split('年')[1].replace('月', '')}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/50 md:mt-1">
                    {month.split('年')[0]}
                  </span>
                </div>
              </div>

              {/* Events List for this month */}
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
                        {/* Time Module (Date + Weekday) */}
                        <div className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-secondary/50 font-bold border border-border/50">
                          <span className="text-lg leading-none">{event.day}</span>
                          <span className="text-[10px] text-muted-foreground uppercase mt-1">周{weekDay}</span>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-base line-clamp-1 group-hover:text-primary transition-colors">{event.name}</h3>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground font-medium">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{event.city || event.country}</span>
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
            <p className="text-muted-foreground font-medium">未找到相关马拉松赛事</p>
            {searchQuery && (
              <p className="text-sm text-muted-foreground/60 mt-2">
                尝试使用不同的搜索关键词
              </p>
            )}
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
