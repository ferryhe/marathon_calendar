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
    <div className="space-y-16">
      <AnimatePresence mode="popLayout">
        {Object.keys(groupedEvents).length > 0 ? (
          Object.entries(groupedEvents).map(([month, events], groupIdx) => (
            <div key={month} className="relative grid grid-cols-1 md:grid-cols-[120px_1fr] gap-8">
              {/* Sticky Month Label */}
              <div className="md:sticky md:top-48 h-fit pt-2">
                <div className="flex items-baseline gap-2 md:flex-col md:items-start md:gap-0">
                  <span className="text-4xl font-black tracking-tighter text-foreground/10 md:text-6xl select-none">
                    {month.split('年')[1].replace('月', '').padStart(2, '0')}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground/40 md:mt-2 px-1">
                    {month.split('年')[0]}
                  </span>
                </div>
              </div>

              {/* Events List for this month */}
              <div className="space-y-4">
                {events.map((event, index) => {
                  const date = new Date(event.year, event.month - 1, event.day);
                  const weekDay = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
                  
                  return (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.05 }}
                      className="group relative flex items-center justify-between p-5 bg-card/50 dark:bg-zinc-900/50 hover:bg-white dark:hover:bg-zinc-800 active:scale-[0.99] transition-all duration-500 rounded-[2rem] border border-black/[0.03] dark:border-white/[0.03] hover:border-black/[0.08] dark:hover:border-white/[0.08] hover:shadow-2xl hover:shadow-black/[0.02] cursor-pointer overflow-hidden"
                      onClick={() => setSelectedEvent(event)}
                      data-testid={`row-event-${event.id}`}
                    >
                      {/* Hover subtle gradient */}
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                      <div className="flex items-center gap-6 relative z-10">
                        {/* Time Module (Date + Weekday) */}
                        <div className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-secondary/80 dark:bg-zinc-800/80 font-bold border border-black/[0.03] dark:border-white/[0.03] group-hover:bg-white dark:group-hover:bg-zinc-700 transition-colors shadow-sm">
                          <span className="text-2xl tracking-tighter leading-none">{event.day}</span>
                          <span className="text-[10px] text-muted-foreground/60 uppercase mt-1.5 font-medium">周{weekDay}</span>
                        </div>
                        
                        <div>
                          <h3 className="font-bold text-lg tracking-tight group-hover:text-blue-500 transition-colors duration-300">{event.name}</h3>
                          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground/70 font-medium">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 opacity-50" />
                              <span>{event.location.city}</span>
                            </div>
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/20" />
                            <span className="tracking-wide">{event.type}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 relative z-10">
                        {event.registrationStatus === 'Open' && (
                          <Badge variant="default" className="bg-blue-500 hover:bg-blue-600 border-0 text-[10px] font-bold tracking-wider px-3 h-6 flex items-center gap-2 rounded-full shadow-lg shadow-blue-500/20">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                            </span>
                            报名中
                          </Badge>
                        )}
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-secondary/50 group-hover:bg-blue-500 group-hover:text-white transition-all duration-300">
                          <ChevronRight className="w-4 h-4 opacity-50 group-hover:opacity-100" />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="py-32 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-secondary/50 mb-6">
              <Calendar className="w-10 h-10 text-muted-foreground/20" />
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
