import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { Link } from "wouter";
import {
  Award,
  Calendar,
  ExternalLink,
  Heart,
  Info,
  MapPin,
  MessageSquare,
  X,
} from "lucide-react";
import type { MarathonListItem } from "@/lib/apiClient";
import {
  useAddFavorite,
  useCurrentUser,
  useFavoriteStatus,
  useRemoveFavorite,
} from "@/hooks/useAuth";

interface EventDetailsProps {
  event: MarathonListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EventDetails({ event, open, onOpenChange }: EventDetailsProps) {
  const { toast } = useToast();
  const { data: currentUser } = useCurrentUser();
  const { data: favoriteStatus } = useFavoriteStatus(event?.id ?? "", open && !!event);
  const addFavoriteMutation = useAddFavorite();
  const removeFavoriteMutation = useRemoveFavorite();

  if (!event) return null;

  const displayDate = event.nextEdition?.raceDate
    ? new Date(event.nextEdition.raceDate)
    : new Date(event.createdAt);
  const year = displayDate.getFullYear();
  const month = displayDate.getMonth() + 1;
  const day = displayDate.getDate();
  const weekDay = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][displayDate.getDay()];
  const status = event.nextEdition?.registrationStatus ?? "待更新";
  const isFavorited = favoriteStatus?.isFavorited ?? false;

  const toggleFavorite = async () => {
    if (!currentUser) return;
    try {
      if (isFavorited) {
        await removeFavoriteMutation.mutateAsync(event.id);
      } else {
        await addFavoriteMutation.mutateAsync(event.id);
      }
    } catch (error) {
      toast({
        title: "操作失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] gap-0 p-0 overflow-hidden rounded-2xl border bg-card max-h-[85vh] overflow-y-auto [&>button:last-child]:hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <DialogTitle className="text-base font-bold">{event.name}</DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="w-8 h-8 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center justify-center w-16 h-16 rounded-xl bg-blue-50 dark:bg-blue-500/10 shrink-0">
              <span className="text-xl font-bold text-blue-600 dark:text-blue-400 leading-none">{day}</span>
              <span className="text-[10px] text-blue-500/70 mt-1">{weekDay}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">{year}年{month}月{day}日</p>
              <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" />
                <span>{event.city || "待更新"}</span>
                {event.country && (
                  <>
                    <span className="opacity-30">·</span>
                    <span>{event.country}</span>
                  </>
                )}
              </div>
            </div>
            <Badge
              variant={status === "报名中" ? "default" : "secondary"}
              className={`shrink-0 text-xs rounded-full px-2.5 h-6 ${status === "报名中" ? "bg-blue-500 hover:bg-blue-600 border-0" : ""}`}
            >
              {status === "报名中" && (
                <span className="relative flex h-1.5 w-1.5 mr-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                </span>
              )}
              {status}
            </Badge>
          </div>

          <Separator />

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-muted-foreground/50" />
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">赛事简介</h4>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed pl-6">
              {event.description || "暂无赛事简介信息"}
            </p>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 bg-secondary/40 rounded-xl">
              <MapPin className="w-4 h-4 text-blue-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">地点</p>
                <p className="text-sm font-medium truncate">{event.city || "未指定"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-secondary/40 rounded-xl">
              <Award className="w-4 h-4 text-orange-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">国家</p>
                <p className="text-sm font-medium truncate">{event.country || "未指定"}</p>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-500" />
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">网友点评</h4>
              </div>
              <button className="text-xs font-medium text-blue-500 hover:text-blue-600 transition-colors">
                我要评价
              </button>
            </div>
            <div className="py-6 text-center bg-secondary/30 rounded-xl border border-dashed border-border/50">
              <p className="text-xs text-muted-foreground">查看详情页可浏览完整评论</p>
            </div>
          </div>
        </div>

        <div className="p-5 pt-0 space-y-2.5">
          <Button
            variant={isFavorited ? "default" : "outline"}
            className="w-full h-11 rounded-xl text-sm"
            onClick={toggleFavorite}
            disabled={
              !currentUser ||
              addFavoriteMutation.isPending ||
              removeFavoriteMutation.isPending
            }
          >
            <Heart className={`w-4 h-4 mr-2 ${isFavorited ? "fill-current" : ""}`} />
            {currentUser
              ? isFavorited
                ? "已收藏，点击取消"
                : "收藏赛事"
              : "登录后可收藏"}
          </Button>

          <Link href={`/marathons/${event.id}`}>
            <Button variant="outline" className="w-full h-11 rounded-xl text-sm">
              查看完整详情页
            </Button>
          </Link>

          {event.websiteUrl && (
            <Button asChild className="w-full h-11 rounded-xl text-sm">
              <a
                href={event.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2"
              >
                前往官网 <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </Button>
          )}

          <p className="text-center text-[10px] text-muted-foreground/50 pt-1 pb-2">
            数据来源于公开搜索，请以官方发布为准
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
