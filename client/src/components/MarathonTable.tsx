import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, MapPin, Calendar, Loader2 } from "lucide-react";
import { EventDetails } from "./EventDetails";
import { motion, AnimatePresence } from "framer-motion";
import { useMarathons } from "@/hooks/useMarathons";
import type { MarathonListItem, MarathonQueryParams } from "@/lib/apiClient";
import { isChinaCountry } from "@shared/utils";

interface MarathonTableProps {
  region: "China" | "Overseas";
  searchQuery: string;
  filters?: {
    year?: number;
    month?: number;
    status?: string;
    sortBy?: "raceDate" | "name" | "createdAt";
    sortOrder?: "asc" | "desc";
  };
  favoriteMarathonIds?: Set<string>;
}

export function MarathonTable({ region, searchQuery, filters, favoriteMarathonIds }: MarathonTableProps) {
  const [selectedEvent, setSelectedEvent] = useState<MarathonListItem | null>(null);

  const queryParams: MarathonQueryParams = {
    limit: 100,
    search: searchQuery || undefined,
    country: region === "China" ? "China" : undefined,
    year: filters?.year,
    month: filters?.month,
    status: filters?.status,
    sortBy: filters?.sortBy ?? "raceDate",
    sortOrder: filters?.sortOrder ?? "asc",
  };

  const { data, isLoading, error } = useMarathons(queryParams);

  const filteredData = useMemo(() => {
    if (!data?.data) return [];
    return data.data.filter((m) => {
      const isChina = isChinaCountry(m.country);
      return region === "China" ? isChina : !isChina;
    });
  }, [data, region]);

  const groupedEvents = useMemo(() => {
    const groups: { [key: string]: MarathonListItem[] } = {};
    filteredData.forEach((event) => {
      const raceDate = event.nextEdition?.raceDate;
      let monthKey: string;
      if (raceDate) {
        const d = new Date(raceDate);
        monthKey = `${d.getFullYear()}-${d.getMonth() + 1}`;
      } else {
        monthKey = "未定";
      }
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(event);
    });
    return groups;
  }, [filteredData]);

  if (isLoading) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-destructive">加载失败，请刷新重试</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AnimatePresence mode="popLayout">
        {Object.keys(groupedEvents).length > 0 ? (
          Object.entries(groupedEvents).map(([monthKey, events]) => {
            let monthLabel = "待定";
            if (monthKey !== "未定") {
              const [y, m] = monthKey.split("-");
              monthLabel = `${y}年${m}月`;
            }

            return (
              <div key={monthKey}>
                <div className="flex items-center gap-3 mb-3 px-1">
                  <h3 className="text-sm font-bold text-muted-foreground/50">{monthLabel}</h3>
                  <div className="flex-1 h-px bg-border/50" />
                  <span className="text-xs text-muted-foreground/30">{events.length} 场</span>
                </div>

                <div className="space-y-2.5">
                  {events.map((event, index) => {
                    const raceDate = event.nextEdition?.raceDate
                      ? new Date(event.nextEdition.raceDate)
                      : null;
                    const day = raceDate ? raceDate.getDate() : "?";
                    const weekDay = raceDate
                      ? ["日", "一", "二", "三", "四", "五", "六"][raceDate.getDay()]
                      : "";
                    const status = event.nextEdition?.registrationStatus;

                    return (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, y: 8 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.35, delay: index * 0.03 }}
                        className="group flex items-center gap-4 p-3.5 bg-card hover:bg-accent/50 active:scale-[0.99] transition-all duration-300 rounded-2xl border cursor-pointer"
                        onClick={() => setSelectedEvent(event)}
                        data-testid={`row-event-${event.id}`}
                      >
                        <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-secondary/60 shrink-0">
                          <span className="text-lg font-bold leading-none">{day}</span>
                          {weekDay && <span className="text-[10px] text-muted-foreground/50 mt-0.5">周{weekDay}</span>}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold truncate group-hover:text-blue-500 transition-colors">{event.name}</h4>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground/50">
                            <MapPin className="w-3 h-3" />
                            <span>{event.city || "待更新"}</span>
                            {event.country && region === "Overseas" && (
                              <>
                                <span className="opacity-30">·</span>
                                <span>{event.country}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {status === "报名中" && (
                            <Badge className="bg-blue-500 hover:bg-blue-600 border-0 text-[10px] px-2 h-5 flex items-center gap-1.5 rounded-full">
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                              </span>
                              报名中
                            </Badge>
                          )}
                          {status && status !== "报名中" && (
                            <Badge variant="secondary" className="text-[10px] px-2 h-5 rounded-full">
                              {status}
                            </Badge>
                          )}
                          <ChevronRight className="w-4 h-4 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors" />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-20 text-center">
            <Calendar className="w-8 h-8 text-muted-foreground/15 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">没有找到符合条件的赛事</p>
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
