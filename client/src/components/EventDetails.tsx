import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Calendar, MapPin, Globe, Award, CalendarClock, ExternalLink } from "lucide-react";
import type { MarathonEvent } from "@/lib/mockData";

interface EventDetailsProps {
  event: MarathonEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EventDetails({ event, open, onOpenChange }: EventDetailsProps) {
  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] gap-0 p-0 overflow-hidden">
        <div className="bg-primary/5 p-6 border-b">
          <Badge 
            variant={event.registrationStatus === 'Open' ? 'default' : 'secondary'} 
            className="mb-2"
          >
            {event.registrationStatus === 'Open' ? 'Registration Open' : 
             event.registrationStatus === 'Upcoming' ? 'Upcoming' : 'Closed'}
          </Badge>
          <DialogTitle className="text-2xl font-bold tracking-tight">
            {event.name}
          </DialogTitle>
          <div className="flex items-center text-muted-foreground mt-2 space-x-2 text-sm">
            <Calendar className="w-4 h-4" />
            <span>{event.year}-{event.month.toString().padStart(2, '0')}-{event.day.toString().padStart(2, '0')}</span>
            <span className="text-muted-foreground/30">•</span>
            <MapPin className="w-4 h-4" />
            <span>
              {[event.location.city, event.location.province, event.location.country === "China" ? "China" : null]
                .filter(Boolean)
                .join(", ")}
            </span>
          </div>
        </div>

        <div className="p-6 grid gap-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</span>
              <div className="flex items-center gap-2 font-medium">
                <Award className="w-4 h-4 text-primary" />
                {event.type === 'Full' ? 'Full Marathon' : event.type === 'Half' ? 'Half Marathon' : event.type}
              </div>
            </div>
            
            {event.certification && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Certification</span>
                <div className="font-medium">{event.certification} Label</div>
              </div>
            )}

            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Registration Deadline</span>
              <div className="flex items-center gap-2 font-medium">
                <CalendarClock className="w-4 h-4 text-muted-foreground" />
                {event.registrationDeadline || "TBA"}
              </div>
            </div>

            {event.requirements && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Requirements</span>
                <div className="font-medium text-sm">{event.requirements}</div>
              </div>
            )}
          </div>

          <Separator />

          {event.description && (
            <div className="space-y-2">
               <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">About Event</span>
               <p className="text-sm leading-relaxed text-muted-foreground">
                 {event.description}
               </p>
            </div>
          )}

          <div className="flex justify-end pt-2">
            {event.website ? (
              <Button asChild className="gap-2">
                <a href={event.website} target="_blank" rel="noopener noreferrer">
                  Visit Website <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            ) : (
              <Button disabled variant="outline">No Website Available</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
