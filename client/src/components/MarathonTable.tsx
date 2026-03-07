import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, MapPin, Calendar, Clock, Loader2 } from "lucide-react";
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
      <div className="py-32 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
        <p className="text-muted-foreground font-medium">正在加载赛事数据...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-32 text-center">
        <p className="text-destructive font-medium">加载失败，请刷新重试</p>
      </div>
    );
  }

  return (
    <div className="space-y-20">
      <AnimatePresence mode="popLayout">
        {Object.keys(groupedEvents).length > 0 ? (
          Object.entries(groupedEvents).map(([monthKey, events]) => {
            let monthNum = "";
            let yearNum = "";
            if (monthKey !== "未定") {
              const [y, m] = monthKey.split("-");
              yearNum = y;
              monthNum = m.padStart(2, "0");
            }

            return (
              <div key={monthKey} className="relative grid grid-cols-1 md:grid-cols-[120px_1fr] gap-8">
                <div className="md:sticky md:top-48 h-fit">
                  <div className="flex items-baseline gap-4 md:flex-col md:items-start md:gap-0">
                    <span className="text-5xl font-black tracking-tighter text-foreground/8 md:text-7xl select-none leading-none">
                      {monthKey === "未定" ? "?" : monthNum}
                    </span>
                    {yearNum && (
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/20 md:mt-3 md:ml-1">
                        {yearNum}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {events.map((event, index) => {
                    const raceDate = event.nextEdition?.raceDate
                      ? new Date(event.nextEdition.raceDate)
                      : null;
                    const day = raceDate ? raceDate.getDate() : "?";
                    const weekDay = raceDate
                      ? ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][raceDate.getDay()]
                      : "";
                    const status = event.nextEdition?.registrationStatus;

                    return (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, x: -12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: "-5% 0px" }}
                        transition={{ duration: 0.5, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
                        className="group relative flex items-center justify-between p-5 bg-secondary/30 dark:bg-zinc-900/40 hover:bg-white dark:hover:bg-zinc-800 transition-all duration-500 rounded-[2rem] border border-black/[0.02] dark:border-white/[0.02] hover:border-black/[0.06] dark:hover:border-white/[0.06] cursor-pointer card-shadow overflow-hidden"
                        onClick={() => setSelectedEvent(event)}
                        data-testid={`row-event-${event.id}`}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                        <div className="flex items-center gap-6 relative z-10 min-w-0">
                          <div className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-white dark:bg-zinc-800 shadow-sm border border-black/[0.02] dark:border-white/[0.05] group-hover:scale-105 transition-transform duration-500 flex-shrink-0">
                            <span className="text-2xl font-black tracking-tighter leading-none">{day}</span>
                            {weekDay && <span className="text-[10px] font-bold text-muted-foreground/60 mt-1.5">{weekDay}</span>}
                          </div>

                          <div className="min-w-0">
                            <h3 className="font-bold text-lg tracking-tight group-hover:text-blue-500 transition-colors duration-300 truncate">{event.name}</h3>
                            <div className="flex flex-wrap items-center gap-3 mt-1 text-sm font-medium text-muted-foreground/60">
                              <div className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 opacity-40" />
                                <span>{event.city || "待更新"}</span>
                              </div>
                              {event.country && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-muted-foreground/20" />
                                  <span>{event.country}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 relative z-10 flex-shrink-0">
                          {status === "报名中" && (
                            <Badge className="bg-blue-500 hover:bg-blue-600 border-0 text-[10px] font-black tracking-wider px-3 h-6 flex items-center gap-2 rounded-full shadow-lg shadow-blue-500/20">
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                              </span>
                              报名中
                            </Badge>
                          )}
                          {status && status !== "报名中" && (
                            <Badge variant="secondary" className="text-[10px] font-bold px-3 h-6 rounded-full">
                              {status}
                            </Badge>
                          )}
                          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white dark:bg-zinc-800 group-hover:bg-blue-500 group-hover:text-white transition-all duration-500 shadow-sm border border-black/[0.02] dark:border-white/[0.05]">
                            <ChevronRight className="w-4 h-4 opacity-40 group-hover:opacity-100" />
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-32 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-secondary/50 mb-6">
              <Calendar className="w-10 h-10 text-muted-foreground/10" />
            </div>
            <p className="text-muted-foreground text-lg font-medium tracking-tight">没有找到符合条件的赛事</p>
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
