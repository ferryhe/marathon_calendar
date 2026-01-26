import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
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
  Info,
  Star,
  ThumbsUp,
  MessageSquare,
  X
} from "lucide-react";
import type { MarathonEvent } from "@/lib/mockData";

interface EventDetailsProps {
  event: MarathonEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EventDetails({ event, open, onOpenChange }: EventDetailsProps) {
  if (!event) return null;
  const isOpen = event.registrationStatus === "报名中";
  const typeLabel = event.type.length ? event.type.join(" / ") : "Various distances";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] gap-0 p-0 overflow-hidden rounded-[2rem] border-0 sm:rounded-[2rem] max-h-[90vh] overflow-y-auto">
        <DialogClose className="absolute right-6 top-6 z-20 rounded-full bg-background/50 p-2 text-muted-foreground hover:text-foreground backdrop-blur-sm transition-colors active:scale-95">
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </DialogClose>
        <div className="bg-secondary/30 p-8 pb-6 sticky top-0 z-10 backdrop-blur-md">
          <div className="flex justify-between items-start mb-4">
            <Badge 
              variant={isOpen ? 'default' : 'secondary'} 
              className={`rounded-full px-3 ${isOpen ? 'bg-blue-500 text-white border-0' : ''}`}
            >
              {event.registrationStatus}
            </Badge>
            
            {event.reviews && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-background/50 rounded-full border border-border/50 shadow-sm">
                <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                <span className="text-xs font-bold">{event.reviews.averageRating}</span>
                <span className="text-[10px] text-muted-foreground">({event.reviews.count}条)</span>
              </div>
            )}
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

        <div className="p-8 pt-6 space-y-8">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-500">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">项目类型</p>
                <p className="text-sm font-semibold">{typeLabel}</p>
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
          <div className="space-y-6">
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

          {/* User Reviews Section */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-500" />
                <h4 className="text-sm font-bold uppercase tracking-wider">网友点评</h4>
              </div>
              <Button variant="ghost" size="sm" className="text-xs h-7 rounded-full font-bold text-blue-500 hover:text-blue-600 hover:bg-blue-500/5">
                我要评价
              </Button>
            </div>

            {event.reviews?.topComments ? (
              <div className="space-y-3">
                {event.reviews.topComments.map((comment, idx) => (
                  <div key={idx} className="p-4 bg-secondary/20 rounded-2xl border border-border/50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold">{comment.user}</span>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                        <ThumbsUp className="w-3 h-3" />
                        <span>{comment.likes}</span>
                      </div>
                    </div>
                    <p className="text-sm text-foreground/70 leading-relaxed">
                      {comment.content}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center bg-secondary/10 rounded-2xl border border-dashed border-border/50">
                <p className="text-xs text-muted-foreground italic">暂无网友评价，快来抢沙发吧</p>
              </div>
            )}
          </div>

          <div className="pt-4 pb-8">
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

