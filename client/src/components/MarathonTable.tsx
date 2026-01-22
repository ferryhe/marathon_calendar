import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, MapPin, Calendar } from "lucide-react";
import { MarathonEvent, MOCK_MARATHONS } from "@/lib/mockData";
import { EventDetails } from "./EventDetails";
import { motion, AnimatePresence } from "framer-motion";

interface MarathonTableProps {
  region: "China" | "Overseas";
  searchQuery: string;
}

export function MarathonTable({ region, searchQuery }: MarathonTableProps) {
  const [selectedEvent, setSelectedEvent] = useState<MarathonEvent | null>(null);

  const groupedEvents = useMemo(() => {
    const filtered = MOCK_MARATHONS.filter((event) => {
      const matchesRegion = event.location.country === (region === "China" ? "China" : "Overseas");
      const matchesSearch = event.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            event.location.city.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesRegion && matchesSearch;
    }).sort((a, b) => {
      return new Date(a.year, a.month - 1, a.day).getTime() - new Date(b.year, b.month - 1, b.day).getTime();
    });

    const groups: { [key: string]: MarathonEvent[] } = {};
    filtered.forEach(event => {
      const key = `${event.year}年${event.month}月`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });
    return groups;
  }, [region, searchQuery]);

  return (
    <div className="space-y-12">
      <AnimatePresence mode="popLayout">
        {Object.keys(groupedEvents).length > 0 ? (
          Object.entries(groupedEvents).map(([month, events], groupIdx) => (
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
                {events.map((event, index) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group relative flex items-center justify-between p-5 bg-card hover:bg-accent/40 active:scale-[0.99] transition-all rounded-3xl border border-border/50 shadow-sm hover:shadow-md cursor-pointer"
                    onClick={() => setSelectedEvent(event)}
                    data-testid={`row-event-${event.id}`}
                  >
                    <div className="flex items-center gap-5">
                      <div className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-secondary font-bold ring-1 ring-border/50">
                        <span className="text-lg leading-none">{event.day}</span>
                        <span className="text-[10px] text-muted-foreground uppercase mt-1">周{['日', '一', '二', '三', '四', '五', '六'][new Date(event.year, event.month - 1, event.day).getDay()]}</span>
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors line-clamp-1">
                          {event.name}
                        </h3>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground font-medium">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-muted-foreground/60" />
                            <span>{event.location.city}</span>
                          </div>
                          <span className="w-1 h-1 rounded-full bg-border" />
                          <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{event.type}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {event.registrationStatus === 'Open' && (
                        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-blue-500 rounded-full border border-blue-500/20">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                          </span>
                          <span className="text-[11px] font-bold">报名中</span>
                        </div>
                      )}
                      <div className="p-2 rounded-full bg-secondary/50 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="py-24 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary mb-4">
              <Calendar className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-muted-foreground font-medium">未找到相关马拉松赛事</p>
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
