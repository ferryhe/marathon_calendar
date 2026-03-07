import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { Link } from "wouter";
import {
  Calendar,
  ExternalLink,
  Heart,
  MapPin,
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

function getStatusStyle(status: string): { bg: string; text: string } {
  if (status === "报名中") return { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" };
  if (status === "即将开始") return { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" };
  return { bg: "bg-muted", text: "text-muted-foreground" };
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
  const weekDay = event.nextEdition?.raceDate
    ? ["日", "一", "二", "三", "四", "五", "六"][displayDate.getDay()]
    : null;
  const status = event.nextEdition?.registrationStatus ?? "待更新";
  const isFavorited = favoriteStatus?.isFavorited ?? false;
  const statusStyle = getStatusStyle(status);

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
      <DialogContent className="sm:max-w-[440px] gap-0 p-0 overflow-hidden rounded-2xl sm:rounded-2xl border max-h-[85vh] overflow-y-auto [&>button:last-child]:hidden">
        <div className="flex items-center justify-between px-4 h-12 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <DialogTitle className="text-base font-semibold truncate pr-4" data-testid="text-event-dialog-title">
            {event.name}
          </DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
            data-testid="button-dialog-close"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-secondary/60 shrink-0">
              <span className="text-lg font-bold leading-none">{event.nextEdition?.raceDate ? day : "--"}</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">
                {weekDay ? `周${weekDay}` : "待定"}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>{year}年{month}月{day}日</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{event.city || event.country || "待更新"}</span>
              </div>
            </div>
            <span className={`ml-auto px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${statusStyle.bg} ${statusStyle.text}`} data-testid="badge-dialog-status">
              {status}
            </span>
          </div>

          <div className="rounded-2xl bg-secondary/30 p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">赛事简介</p>
            <p className="text-sm leading-relaxed text-foreground/80" data-testid="text-event-description">
              {event.description || "暂无赛事简介信息"}
            </p>
          </div>

          {event.country && (
            <div className="flex items-center gap-2 px-1">
              <span className="text-sm text-muted-foreground">国家/地区</span>
              <span className="text-sm font-medium" data-testid="text-event-country">{event.country}</span>
            </div>
          )}

          <div className="space-y-2 pt-2">
            <div className="flex gap-2">
              <Button
                variant={isFavorited ? "default" : "outline"}
                className="flex-1 h-10 rounded-xl text-sm"
                onClick={toggleFavorite}
                disabled={
                  !currentUser ||
                  addFavoriteMutation.isPending ||
                  removeFavoriteMutation.isPending
                }
                data-testid="button-toggle-favorite"
              >
                <Heart className={`w-4 h-4 mr-1.5 ${isFavorited ? "fill-current" : ""}`} />
                {currentUser
                  ? isFavorited
                    ? "已收藏"
                    : "收藏"
                  : "登录后收藏"}
              </Button>

              <Link href={`/marathons/${event.id}`}>
                <Button variant="outline" className="h-10 rounded-xl text-sm" data-testid="link-detail-page">
                  详情
                </Button>
              </Link>
            </div>

            {event.websiteUrl && (
              <Button
                asChild
                className="w-full h-11 rounded-xl text-sm font-semibold"
              >
                <a
                  href={event.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5"
                  data-testid="link-official-website"
                >
                  前往官网 <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </Button>
            )}
          </div>

          <p className="text-center text-[10px] text-muted-foreground pt-1 pb-2">
            数据来源于公开搜索，请以官方发布为准
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
