import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, ChevronRight, ExternalLink, Loader2, MapPin } from "lucide-react";
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

type MarathonTableView =
  | { mode: "grouped"; groups: Record<string, MarathonWithDate[]>; tbd: MarathonWithDate[] }
  | { mode: "flat"; events: MarathonWithDate[]; tbd: MarathonWithDate[] };

const CHINA_COUNTRY_ALIASES = new Set([
  "china", "cn", "chn", "中国", "中国大陆", "中华人民共和国",
  "mainland china", "people's republic of china", "prc",
]);

function normalizeCountryText(value?: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/[\s._-]+/g, " ").replace(/['']/g, "'");
}

function isChinaCountry(value?: string | null) {
  const normalized = normalizeCountryText(value);
  if (!normalized) return false;
  return CHINA_COUNTRY_ALIASES.has(normalized);
}

function getStatusStyle(status: string): { bg: string; text: string } {
  if (status === "报名中") return { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" };
  if (status === "即将开始") return { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" };
  return { bg: "bg-muted", text: "text-muted-foreground" };
}

function EventCard({ event, index, onSelect }: { event: MarathonWithDate; index: number; onSelect: (e: MarathonListItem) => void }) {
  const weekDay = event.day > 0
    ? ["日", "一", "二", "三", "四", "五", "六"][event.displayDate.getDay()]
    : null;
  const statusStyle = getStatusStyle(event.registrationStatus);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
      className="group flex items-center gap-3 p-3 bg-card hover:bg-accent/40 active:scale-[0.98] transition-all rounded-2xl border cursor-pointer"
      onClick={() => onSelect(event)}
      data-testid={`row-event-${event.id}`}
    >
      <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-secondary/60 shrink-0">
        <span className="text-base font-bold leading-none">{event.day > 0 ? event.day : "--"}</span>
        <span className="text-[10px] text-muted-foreground mt-0.5">
          {weekDay ? `周${weekDay}` : "待定"}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold line-clamp-1 group-hover:text-primary transition-colors" data-testid={`text-event-name-${event.id}`}>
          {event.name}
        </h3>
        <div className="flex items-center gap-1 mt-0.5 text-sm text-muted-foreground">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate text-xs">{event.city || event.country || "待更新"}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {event.websiteUrl && (
          <a
            href={event.websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center w-7 h-7 rounded-full border bg-background hover:bg-accent transition-colors"
            onClick={(e) => e.stopPropagation()}
            title="打开官网"
            data-testid={`link-website-${event.id}`}
          >
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
          </a>
        )}
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusStyle.bg} ${statusStyle.text}`} data-testid={`badge-status-${event.id}`}>
          {event.registrationStatus}
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground/20 group-hover:text-muted-foreground transition-colors" />
      </div>
    </motion.div>
  );
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

  const view = useMemo<MarathonTableView>(() => {
    if (!data?.data) return { mode: "grouped", groups: {}, tbd: [] };

    const { dated, tbd } = data.data
      .filter((marathon) => {
        if (region === "China" && !isChinaCountry(marathon.country)) return false;
        if (region === "Overseas" && isChinaCountry(marathon.country)) return false;
        if (showMineOnly && !favoriteMarathonIds.has(marathon.id)) return false;
        return true;
      })
      .reduce(
        (acc, marathon) => {
          const editionDate = marathon.nextEdition?.raceDate;
          if (!editionDate) {
            acc.tbd.push({
              ...marathon,
              displayDate: new Date(marathon.createdAt),
              year: filters.year,
              month: 0,
              day: 0,
              registrationStatus: marathon.nextEdition?.registrationStatus ?? "待更新",
            } as MarathonWithDate);
            return acc;
          }

          const displayDate = new Date(editionDate);
          acc.dated.push({
            ...marathon,
            displayDate,
            year: displayDate.getFullYear(),
            month: displayDate.getMonth() + 1,
            day: displayDate.getDate(),
            registrationStatus: marathon.nextEdition?.registrationStatus ?? "待更新",
          } as MarathonWithDate);
          return acc;
        },
        { dated: [] as MarathonWithDate[], tbd: [] as MarathonWithDate[] },
      );

    if (filters.sortBy !== "raceDate") {
      return { mode: "flat", events: dated, tbd };
    }

    const sortedByDate = [...dated].sort(
      (a, b) => a.displayDate.getTime() - b.displayDate.getTime(),
    );

    const groups: Record<string, MarathonWithDate[]> = {};
    for (const event of sortedByDate) {
      const key = `${event.year}年${event.month}月`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    }

    return { mode: "grouped", groups, tbd };
  }, [data, region, showMineOnly, favoriteMarathonIds, filters.sortBy, filters.year]);

  if (isLoading || (showMineOnly && favoritesLoading)) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-24 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10 mb-3">
          <Calendar className="w-6 h-6 text-destructive" />
        </div>
        <p className="text-sm font-medium text-destructive" data-testid="text-error">加载赛事数据失败</p>
        <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
      </div>
    );
  }

  const hasData =
    view.mode === "grouped"
      ? Object.keys(view.groups).length > 0 || view.tbd.length > 0
      : view.events.length > 0 || view.tbd.length > 0;
  const emptyTitle = showMineOnly ? "你还没有收藏赛事" : "未找到相关马拉松赛事";
  const emptyHint = showMineOnly
    ? '可在赛事详情中点击"收藏赛事"后再查看'
    : searchQuery
      ? "尝试使用不同的搜索关键词"
      : "";

  return (
    <div className="space-y-6">
      <AnimatePresence mode="popLayout">
        {hasData ? (
          <div className="space-y-6">
            {view.mode === "grouped" ? (
              Object.entries(view.groups).map(([month, events]) => (
                <div key={month}>
                  <div className="flex items-baseline gap-2 mb-3 px-1">
                    <span className="text-sm font-semibold text-foreground" data-testid={`text-month-${month}`}>
                      {month}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      — {events.length}场
                    </span>
                  </div>
                  <div className="space-y-2">
                    {events.map((event, index) => (
                      <EventCard key={event.id} event={event} index={index} onSelect={setSelectedEvent} />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="space-y-2">
                {view.events.map((event, index) => (
                  <EventCard key={event.id} event={event} index={index} onSelect={setSelectedEvent} />
                ))}
              </div>
            )}

            {view.tbd.length > 0 && (
              <div>
                <div className="flex items-baseline gap-2 mb-3 px-1">
                  <span className="text-sm font-semibold text-foreground">待确认日期</span>
                  <span className="text-sm text-muted-foreground">— {view.tbd.length}场</span>
                </div>
                <div className="space-y-2">
                  {view.tbd.map((event, index) => (
                    <EventCard key={event.id} event={event} index={index} onSelect={setSelectedEvent} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-24 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-secondary mb-3">
              <Calendar className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm text-muted-foreground font-medium" data-testid="text-empty">{emptyTitle}</p>
            {emptyHint && <p className="text-sm text-muted-foreground/60 mt-1">{emptyHint}</p>}
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
