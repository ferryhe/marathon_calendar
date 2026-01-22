import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ArrowUpDown, ChevronRight } from "lucide-react";
import { MarathonEvent, MOCK_MARATHONS } from "@/lib/mockData";
import { EventDetails } from "./EventDetails";
import { motion, AnimatePresence } from "framer-motion";

interface MarathonTableProps {
  region: "China" | "Overseas";
  searchQuery: string;
}

export function MarathonTable({ region, searchQuery }: MarathonTableProps) {
  const [selectedEvent, setSelectedEvent] = useState<MarathonEvent | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Filter and Sort Data
  const filteredEvents = useMemo(() => {
    let events = MOCK_MARATHONS.filter((event) => {
      const matchesRegion = event.location.country === (region === "China" ? "China" : "Overseas");
      const matchesSearch = event.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            event.location.city.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesRegion && matchesSearch;
    });

    return events.sort((a, b) => {
      const dateA = new Date(a.year, a.month - 1, a.day).getTime();
      const dateB = new Date(b.year, b.month - 1, b.day).getTime();
      return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });
  }, [region, searchQuery, sortOrder]);

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[120px]">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="-ml-3 h-8 data-[state=open]:bg-accent"
                  onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                >
                  <span>Date</span>
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Event Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="w-[100px]">Type</TableHead>
              <TableHead className="w-[140px]">Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence mode='wait'>
              {filteredEvents.length > 0 ? (
                filteredEvents.map((event) => (
                  <TableRow 
                    key={event.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setSelectedEvent(event)}
                    data-testid={`row-event-${event.id}`}
                  >
                    <TableCell className="font-mono font-medium text-muted-foreground">
                      {event.year}-{event.month.toString().padStart(2, '0')}-{event.day.toString().padStart(2, '0')}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {event.name}
                      {event.certification && (
                        <span className="ml-2 inline-flex items-center rounded-sm border px-1 text-[10px] font-medium text-muted-foreground">
                          {event.certification} Label
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {[event.location.city, event.location.province].filter(Boolean).join(", ")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal text-xs">
                        {event.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={event.registrationStatus === 'Open' ? 'default' : 'secondary'}
                        className={event.registrationStatus === 'Open' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                      >
                        {event.registrationStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No results found.
                  </TableCell>
                </TableRow>
              )}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>

      <EventDetails 
        event={selectedEvent} 
        open={!!selectedEvent} 
        onOpenChange={(open) => !open && setSelectedEvent(null)} 
      />
    </div>
  );
}
