import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Calendar, 
  MapPin, 
  Award, 
  CalendarClock, 
  ExternalLink,
  Thermometer,
  Mountain,
  Users,
  Timer,
  Info
} from "lucide-react";
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
      <DialogContent className="sm:max-w-[500px] gap-0 p-0 overflow-hidden rounded-[2rem] border-0 sm:rounded-[2rem]">
        <div className="bg-secondary/30 p-8 pb-6">
          <div className="flex justify-between items-start mb-4">
            <Badge 
              variant={event.registrationStatus === 'Open' ? 'default' : 'secondary'} 
              className={`rounded-full px-3 ${event.registrationStatus === 'Open' ? 'bg-blue-500 text-white border-0' : ''}`}
            >
              {event.registrationStatus === 'Open' ? '报名中' : 
               event.registrationStatus === 'Upcoming' ? '即将开始' : '已截止'}
            </Badge>
          </div>
          <DialogTitle className="text-2xl font-bold tracking-tight leading-tight">
            {event.name}
          </DialogTitle>
          <div className="flex items-center text-muted-foreground mt-3 space-x-3 text-sm font-medium">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>{event.year}-{event.month}-{event.day}</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              <span>{event.location.city}</span>
            </div>
          </div>
        </div>

        <div className="p-8 pt-6 space-y-6">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-500">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">项目类型</p>
                <p className="text-sm font-semibold">{event.type}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-500/10 text-orange-500">
                <Timer className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">报名截止</p>
                <p className="text-sm font-semibold">{event.registrationDeadline || "TBA"}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500">
                <Mountain className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">赛道坡度</p>
                <p className="text-sm font-semibold">平坦 (示例)</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-500">
                <Thermometer className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">平均气温</p>
                <p className="text-sm font-semibold">12°C - 18°C</p>
              </div>
            </div>
          </div>

          <Separator className="opacity-50" />

          {/* Detailed Info */}
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-1">
                <Users className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase mb-1">报名要求</p>
                <p className="text-sm text-foreground/80 leading-relaxed">{event.requirements || "详情请咨询官方规程"}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1">
                <Info className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase mb-1">赛事简介</p>
                <p className="text-sm text-foreground/80 leading-relaxed">{event.description || "暂无赛事简介信息"}</p>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <Button asChild className="w-full h-14 rounded-2xl text-base font-semibold shadow-xl shadow-primary/10 transition-transform active:scale-[0.97]">
              <a href={event.website || "#"} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2">
                前往官网报名 <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
            <p className="text-center text-[10px] text-muted-foreground mt-4">
              数据来源于公开搜索，请以官方发布为准
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
