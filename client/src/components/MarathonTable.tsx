import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, MapPin, Calendar, Clock } from "lucide-react";
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
      const matchesSearch = 
        event.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        event.location.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.type.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesRegion && matchesSearch;
    }).sort((a, b) => {
      return new Date(a.year, a.month - 1, a.day).getTime() - new Date(b.year, b.month - 1, b.day).getTime();
    });

    const groups: { [key: string]: MarathonEvent[] } = {};
    filtered.forEach(event => {
      const key = `${event.year}-${event.month}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });
    return groups;
  }, [region, searchQuery]);

  return (
    <div className="space-y-32">
      <AnimatePresence mode="popLayout">
        {Object.keys(groupedEvents).length > 0 ? (
          Object.entries(groupedEvents).map(([monthKey, events]) => {
            const [year, month] = monthKey.split('-');
            return (
              <div key={monthKey} className="relative grid grid-cols-1 md:grid-cols-[140px_1fr] gap-12">
                {/* Large Floating Month Indicator */}
                <div className="md:sticky md:top-48 h-fit">
                  <div className="flex items-baseline gap-4 md:flex-col md:items-start md:gap-0">
                    <span className="text-7xl font-black tracking-tighter text-foreground/5 md:text-8xl select-none leading-none">
                      {month.padStart(2, '0')}
                    </span>
                    <span className="text-xs font-black uppercase tracking-[0.4em] text-muted-foreground/20 md:mt-4 md:ml-2">
                      {year}
                    </span>
                  </div>
                </div>

                <div className="space-y-6">
                  {events.map((event, index) => {
                    const date = new Date(event.year, event.month - 1, event.day);
                    const weekDay = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
                    
                    return (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: "-10% 0px" }}
                        transition={{ duration: 0.6, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
                        className="group relative flex items-center justify-between p-6 bg-secondary/30 dark:bg-zinc-900/40 hover:bg-white dark:hover:bg-zinc-800 transition-all duration-700 rounded-[2.5rem] border border-black/[0.02] dark:border-white/[0.02] hover:border-black/[0.06] dark:hover:border-white/[0.06] cursor-pointer card-shadow overflow-hidden"
                        onClick={() => setSelectedEvent(event)}
                      >
                        {/* Interactive Background Gradient */}
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                        <div className="flex items-center gap-8 relative z-10">
                          {/* Minimalist Date Box */}
                          <div className="flex flex-col items-center justify-center w-20 h-20 rounded-[1.75rem] bg-white dark:bg-zinc-800 shadow-sm border border-black/[0.02] dark:border-white/[0.05] group-hover:scale-105 transition-transform duration-500">
                            <span className="text-3xl font-black tracking-tighter leading-none">{event.day}</span>
                            <span className="text-[10px] font-bold text-muted-foreground/60 uppercase mt-2">{weekDay}</span>
                          </div>
                          
                          <div className="space-y-2">
                            <h3 className="font-bold text-xl tracking-tight group-hover:text-blue-500 transition-colors duration-500">{event.name}</h3>
                            <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-muted-foreground/60">
                              <div className="flex items-center gap-1.5">
                                <MapPin className="w-4 h-4 opacity-40" />
                                <span>{event.location.city}</span>
                              </div>
                              <span className="w-1 h-1 rounded-full bg-muted-foreground/20" />
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-4 h-4 opacity-40" />
                                <span>{event.type}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-6 relative z-10">
                          {event.registrationStatus === 'Open' && (
                            <Badge className="bg-blue-500 hover:bg-blue-600 border-0 text-[10px] font-black tracking-widest px-4 h-7 flex items-center gap-2.5 rounded-full shadow-lg shadow-blue-500/20 uppercase">
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                              </span>
                              报名中
                            </Badge>
                          )}
                          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white dark:bg-zinc-800 group-hover:bg-blue-500 group-hover:text-white transition-all duration-500 shadow-sm border border-black/[0.02] dark:border-white/[0.05]">
                            <ChevronRight className="w-5 h-5 opacity-40 group-hover:opacity-100" />
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
          <div className="py-40 text-center">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-secondary/50 mb-8">
              <Calendar className="w-12 h-12 text-muted-foreground/10" />
            </div>
            <p className="text-muted-foreground text-xl font-medium tracking-tight">没有找到符合条件的赛事</p>
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
