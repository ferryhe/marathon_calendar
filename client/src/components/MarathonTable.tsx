import { useMemo, useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, ChevronRight, Loader2, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { useMarathons } from "@/hooks/useMarathons";
import { EventDetails } from "./EventDetails";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import type { MarathonListItem } from "@/lib/apiClient";
import { isChinaCountry } from "@shared/utils";
import { pickLocalizedCity, pickLocalizedName, useLocale } from "@/lib/locale";
import { StatusBadge } from "./StatusBadge";

// Highlight helper component for search terms
function HighlightText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight.trim()) {
    return <>{text}</>;
  }
  
  const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === highlight.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-500/30 text-foreground rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

interface MarathonTableProps {
  region: "China" | "Overseas" | "WMM";
  searchQuery: string;
  filters: {
    year: number;
    month?: number;
    status?: string;
    country?: string;
    kind?: "marathon" | "trail";
    sortBy: "raceDate" | "name" | "createdAt";
    sortOrder?: "asc" | "desc";
  };
  showMineOnly?: boolean;
  favoriteMarathonIds?: Set<string>;
  favoritesLoading?: boolean;
  externalPage?: number;
  onPageChange?: (page: number) => void;
}

interface MarathonWithDate extends MarathonListItem {
  displayDate: Date;
  year: number;
  month: number;
  day: number;
  registrationStatus: string;
  localizedName: string;
  localizedCity: string | null;
}

type MarathonTableView =
  | { mode: "grouped"; groups: Record<string, MarathonWithDate[]>; tbd: MarathonWithDate[] }
  | { mode: "flat"; events: MarathonWithDate[]; tbd: MarathonWithDate[] };

export function MarathonTable({
  region,
  searchQuery,
  filters,
  showMineOnly = false,
  favoriteMarathonIds = new Set<string>(),
  favoritesLoading = false,
  externalPage,
  onPageChange,
}: MarathonTableProps) {
  const { t, i18n } = useTranslation();
  const locale = useLocale();
  const [selectedEvent, setSelectedEvent] = useState<MarathonListItem | null>(null);
  const [page, setPage] = useState(1);
  const currentPage = externalPage ?? page;
  const { data, isLoading, error } = useMarathons({
    region,
    search: searchQuery || undefined,
    limit: 100,
    page: currentPage,
    year: filters.year,
    month: filters.month,
    status: filters.status,
    country: filters.country,
    kind: filters.kind,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder || "asc",
  });

  const paginationInfo = data?.pagination;
  const totalPages = paginationInfo?.totalPages ?? 1;

  const handlePageChange = (newPage: number) => {
    if (onPageChange) {
      onPageChange(newPage);
    } else {
      setPage(newPage);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const prevFiltersRef = useRef({ searchQuery, region, filters });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (prev.searchQuery !== searchQuery || 
        prev.region !== region ||
        prev.filters.month !== filters.month ||
        prev.filters.status !== filters.status ||
        prev.filters.country !== filters.country ||
        prev.filters.kind !== filters.kind ||
        prev.filters.sortBy !== filters.sortBy ||
        prev.filters.sortOrder !== filters.sortOrder) {
      handlePageChange(1);
    }
    prevFiltersRef.current = { searchQuery, region, filters };
  }, [searchQuery, region, filters]);

  const weekdays = t("list.weekdays", { returnObjects: true }) as string[];
  const weekdayPrefix = t("list.weekdayPrefix");
  const locationFallback = t("list.locationFallback");

  const view = useMemo<MarathonTableView>(() => {
    if (!data?.data) return { mode: "grouped", groups: {}, tbd: [] };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // When the user explicitly filters by a terminal status (ended/cancelled),
    // we want past-date editions to render — otherwise the result list is empty.
    const showPastEditions = filters.status === "ended" || filters.status === "cancelled";

    const { dated, tbd } = data.data
      .filter((marathon) => {
        if (region === "China" && !isChinaCountry(marathon.country)) {
          return false;
        }
        if (region === "Overseas" && isChinaCountry(marathon.country)) {
          return false;
        }
        if (showMineOnly && !favoriteMarathonIds.has(marathon.id)) {
          return false;
        }
        const raceDate = marathon.nextEdition?.raceDate;
        if (raceDate && !showPastEditions) {
          const [y, m, d] = raceDate.split("-").map(Number);
          const raceDay = new Date(y!, m! - 1, d!);
          if (raceDay < today) return false;
        }
        return true;
      })
      .reduce(
        (acc, marathon) => {
          const localizedName = pickLocalizedName(marathon, locale);
          const localizedCity = pickLocalizedCity(marathon, locale);
          const editionDate = marathon.nextEdition?.raceDate;
          if (!editionDate) {
            acc.tbd.push({
              ...marathon,
              displayDate: null,
              year: filters.year,
              month: 0,
              day: 0,
              registrationStatus: marathon.nextEdition?.registrationStatus ?? "待更新",
              localizedName,
              localizedCity,
            } as MarathonWithDate);
            return acc;
          }

          const [ey, em, ed] = editionDate.split("-").map(Number);
          const displayDate = new Date(ey!, em! - 1, ed!);
          acc.dated.push({
            ...marathon,
            displayDate,
            year: ey,
            month: em,
            day: ed,
            registrationStatus: marathon.nextEdition?.registrationStatus ?? "待更新",
            localizedName,
            localizedCity,
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
      const key = t("list.monthYear", { year: event.year, month: event.month });
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    }

    return { mode: "grouped", groups, tbd };
  }, [data, region, showMineOnly, favoriteMarathonIds, filters.sortBy, filters.year, locale, t]);

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
        <p className="text-destructive font-medium">{t("list.loadFailed")}</p>
        <p className="text-sm text-muted-foreground mt-2">{(error as Error).message}</p>
      </div>
    );
  }

  const hasData =
    view.mode === "grouped"
      ? Object.keys(view.groups).length > 0 || view.tbd.length > 0
      : view.events.length > 0 || view.tbd.length > 0;
  const emptyTitle = showMineOnly ? t("list.emptyFavorites") : t("list.emptyDefault");
  const emptyHint = showMineOnly
    ? t("list.emptyFavoritesHint")
    : searchQuery
      ? t("list.emptySearchHint")
      : "";

  // Header label for grouped month: derive both parts from the data, not from the formatted string,
  // so EN and ZH layouts both work cleanly.
  const renderMonthHeader = (events: MarathonWithDate[]) => {
    const sample = events[0];
    if (!sample) return null;
    if (i18n.language?.startsWith("en")) {
      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const monthName = monthNames[sample.month - 1];
      return (
        <div className="flex items-baseline gap-2 md:flex-col md:items-start md:gap-0">
          <span className="text-3xl font-black tracking-tighter text-foreground/20 md:text-4xl">
            {monthName}
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/50 md:mt-1">
            {sample.year}
          </span>
        </div>
      );
    }
    return (
      <div className="flex items-baseline gap-2 md:flex-col md:items-start md:gap-0">
        <span className="text-3xl font-black tracking-tighter text-foreground/20 md:text-4xl">
          {sample.month}
        </span>
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/50 md:mt-1">
          {sample.year}年
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-12">
      <AnimatePresence mode="popLayout">
        {hasData ? (
          <div className="space-y-12">
            {view.mode === "grouped" ? (
              Object.entries(view.groups).map(([month, events]) => (
                <div
                  key={month}
                  className="relative grid grid-cols-1 md:grid-cols-[100px_1fr] gap-6"
                >
                  <div className="md:sticky md:top-44 h-fit">
                    {renderMonthHeader(events)}
                  </div>

                  <div className="space-y-3">
                    {events.map((event, index) => {
                      const weekDay = weekdays[event.displayDate.getDay()];
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
                              <span className="text-[10px] text-muted-foreground uppercase mt-1">
                                {weekdayPrefix}{weekDay}
                              </span>
                            </div>

                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-base line-clamp-1 group-hover:text-primary transition-colors">
                                <HighlightText text={event.localizedName} highlight={searchQuery} />
                              </h3>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground font-medium">
                                <MapPin className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate"><HighlightText text={event.localizedCity || event.country || locationFallback} highlight={searchQuery} /></span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <StatusBadge
                              status={event.nextEdition?.status}
                              legacyStatus={event.registrationStatus}
                              raceDate={event.nextEdition?.raceDate ?? null}
                              registrationStart={event.nextEdition?.registrationOpenDate ?? null}
                              registrationEnd={event.nextEdition?.registrationCloseDate ?? null}
                            />
                            <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="space-y-3">
                {view.events.map((event, index) => {
                  const weekDay = weekdays[event.displayDate.getDay()];
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
                          <span className="text-[10px] text-muted-foreground uppercase mt-1">
                            {weekdayPrefix}{weekDay}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-base line-clamp-1 group-hover:text-primary transition-colors">
                            <HighlightText text={event.localizedName} highlight={searchQuery} />
                          </h3>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground font-medium">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate"><HighlightText text={event.localizedCity || event.country || locationFallback} highlight={searchQuery} /></span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <StatusBadge
                          status={event.nextEdition?.status}
                          legacyStatus={event.registrationStatus}
                          raceDate={event.nextEdition?.raceDate ?? null}
                          registrationStart={event.nextEdition?.registrationOpenDate ?? null}
                          registrationEnd={event.nextEdition?.registrationCloseDate ?? null}
                        />
                        <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {view.tbd.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{t("list.tbdTitle")}</div>
                  <div className="text-xs text-muted-foreground">{t("list.tbdHint")}</div>
                </div>
                {view.tbd.map((event, index) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="group relative flex items-center justify-between p-4 bg-card hover:bg-accent/50 active:scale-[0.98] transition-all rounded-2xl border cursor-pointer"
                    onClick={() => setSelectedEvent(event)}
                    data-testid={`row-event-tbd-${event.id}`}
                  >
                    <div className="flex items-center gap-5">
                      <div className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-secondary/30 font-bold border border-border/50">
                        <span className="text-lg leading-none">--</span>
                        <span className="text-[10px] text-muted-foreground uppercase mt-1">{t("list.tbdShort")}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base line-clamp-1 group-hover:text-primary transition-colors">
                          <HighlightText text={event.localizedName} highlight={searchQuery} />
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground font-medium">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate"><HighlightText text={event.localizedCity || event.country || locationFallback} highlight={searchQuery} /></span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <StatusBadge
                        status={event.nextEdition?.status}
                        legacyStatus={event.registrationStatus}
                        raceDate={event.nextEdition?.raceDate ?? null}
                        registrationStart={event.nextEdition?.registrationOpenDate ?? null}
                        registrationEnd={event.nextEdition?.registrationCloseDate ?? null}
                        glow={false}
                      />
                      <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : null}
          </div>
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

      {totalPages > 1 && (
        <div className="mt-8 flex justify-center">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  href="#" 
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage > 1) handlePageChange(currentPage - 1);
                  }}
                  className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
              
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        handlePageChange(pageNum);
                      }}
                      isActive={currentPage === pageNum}
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              
              {totalPages > 5 && currentPage < totalPages - 2 && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}
              
              <PaginationItem>
                <PaginationNext 
                  href="#" 
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage < totalPages) handlePageChange(currentPage + 1);
                  }}
                  className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      <EventDetails
        event={selectedEvent}
        open={!!selectedEvent}
        onOpenChange={(open) => !open && setSelectedEvent(null)}
      />
    </div>
  );
}
