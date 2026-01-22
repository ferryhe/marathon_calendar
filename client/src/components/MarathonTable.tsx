import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, ChevronRight, MapPin } from "lucide-react";
import { MarathonEvent, MOCK_MARATHONS } from "@/lib/mockData";
import { EventDetails } from "./EventDetails";
import { motion, AnimatePresence } from "framer-motion";

interface MarathonTableProps {
  region: "China" | "Overseas";
  searchQuery: string;
}

export function MarathonTable({ region, searchQuery }: MarathonTableProps) {
  const [selectedEvent, setSelectedEvent] = useState<MarathonEvent | null>(null);

  const filteredEvents = useMemo(() => {
    return MOCK_MARATHONS.filter((event) => {
      const matchesRegion = event.location.country === (region === "China" ? "China" : "Overseas");
      const matchesSearch = event.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            event.location.city.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesRegion && matchesSearch;
    }).sort((a, b) => {
      return new Date(a.year, a.month - 1, a.day).getTime() - new Date(b.year, b.month - 1, b.day).getTime();
    });
  }, [region, searchQuery]);

  return (
    <div className="space-y-2">
      <AnimatePresence mode="popLayout">
        {filteredEvents.length > 0 ? (
          filteredEvents.map((event, index) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: index * 0.03 }}
              className="group relative flex items-center justify-between p-4 bg-card hover:bg-accent/50 active:scale-[0.98] transition-all rounded-2xl border cursor-pointer"
              onClick={() => setSelectedEvent(event)}
              data-testid={`row-event-${event.id}`}
            >
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-secondary/50 font-bold">
                  <span className="text-[10px] text-muted-foreground uppercase leading-none">{event.month}月</span>
                  <span className="text-lg leading-none mt-1">{event.day}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-base line-clamp-1">{event.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    <span>{event.location.city}</span>
                    <span className="opacity-30">|</span>
                    <span>{event.type}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {event.registrationStatus === 'Open' && (
                  <Badge variant="default" className="bg-blue-500 hover:bg-blue-600 border-0 text-[10px] px-1.5 h-5">
                    报名中
                  </Badge>
                )}
                <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
              </div>
            </motion.div>
          ))
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            未找到相关马拉松
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
