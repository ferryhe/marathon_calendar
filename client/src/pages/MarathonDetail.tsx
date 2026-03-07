import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import {
  Calendar,
  ChevronRight,
  ExternalLink,
  Flag,
  Heart,
  MapPin,
  Pencil,
  Star,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";
import {
  useCreateReview,
  useDeleteReview,
  useLikeReview,
  useMarathon,
  useMarathonReviews,
  useReportReview,
  useUpdateReview,
} from "@/hooks/useMarathons";
import {
  useAddFavorite,
  useCurrentUser,
  useFavoriteStatus,
  useLogin,
  useLogout,
  useRegister,
  useRemoveFavorite,
} from "@/hooks/useAuth";
import { PageShell, AuthCard } from "@/components/PageShell";

function formatDate(dateValue?: string | null) {
  if (!dateValue) return "待更新";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "待更新";
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

function formatShortDate(dateValue?: string | null) {
  if (!dateValue) return { month: "—", day: "—", weekday: "" };
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return { month: "—", day: "—", weekday: "" };
  const month = date.toLocaleDateString("zh-CN", { month: "short" });
  const day = date.getDate().toString();
  const weekday = date.toLocaleDateString("zh-CN", { weekday: "short" });
  return { month, day, weekday };
}

function StarRating({ rating, onChange, interactive = false }: { rating: number; onChange?: (v: number) => void; interactive?: boolean }) {
  return (
    <div className="flex items-center gap-0.5" data-testid="star-rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          className={`transition-colors ${interactive ? "cursor-pointer hover:scale-110" : "cursor-default"}`}
          onClick={() => interactive && onChange?.(star)}
          data-testid={`star-${star}`}
        >
          <Star
            className={`w-5 h-5 ${star <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
          />
        </button>
      ))}
    </div>
  );
}

export default function MarathonDetailPage() {
  const { toast } = useToast();
  const [matched, params] = useRoute("/marathons/:id");
  const marathonId = matched ? params.id : "";

  const { data, isLoading, error } = useMarathon(marathonId);
  const { data: reviews = [] } = useMarathonReviews(marathonId);
  const { data: currentUser } = useCurrentUser();
  const { data: favoriteStatus } = useFavoriteStatus(marathonId, !!marathonId);

  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const logoutMutation = useLogout();
  const addFavoriteMutation = useAddFavorite();
  const removeFavoriteMutation = useRemoveFavorite();

  const createReviewMutation = useCreateReview(marathonId);
  const updateReviewMutation = useUpdateReview(marathonId);
  const deleteReviewMutation = useDeleteReview(marathonId);
  const likeReviewMutation = useLikeReview(marathonId);
  const reportReviewMutation = useReportReview(marathonId);

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);

  const isFavorited = favoriteStatus?.isFavorited ?? false;

  const reviewStats = useMemo(() => {
    if (reviews.length === 0) return { count: 0, average: 0 };
    const total = reviews.reduce((sum, item) => sum + item.rating, 0);
    return { count: reviews.length, average: total / reviews.length };
  }, [reviews]);

  const submitAuth = async () => {
    if (!authUsername || !authPassword) return;
    try {
      if (isRegisterMode) {
        await registerMutation.mutateAsync({ username: authUsername, password: authPassword });
      } else {
        await loginMutation.mutateAsync({ username: authUsername, password: authPassword });
      }
      setAuthPassword("");
    } catch (error) {
      toast({
        title: isRegisterMode ? "注册失败" : "登录失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const toggleFavorite = async () => {
    if (!currentUser || !marathonId) return;
    try {
      if (isFavorited) {
        await removeFavoriteMutation.mutateAsync(marathonId);
      } else {
        await addFavoriteMutation.mutateAsync(marathonId);
      }
    } catch (error) {
      toast({
        title: "操作失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const submitReview = async () => {
    const trimmedComment = comment.trim();
    const commentPayload = trimmedComment === "" ? null : trimmedComment;
    try {
      if (editingReviewId) {
        await updateReviewMutation.mutateAsync({
          reviewId: editingReviewId,
          payload: { rating, comment: commentPayload },
        });
        setEditingReviewId(null);
      } else {
        await createReviewMutation.mutateAsync({
          rating,
          comment: commentPayload,
          marathonEditionId: data?.editions?.[0]?.id,
        });
      }
      setRating(5);
      setComment("");
    } catch (error) {
      toast({
        title: "提交失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  if (!matched) return null;

  const latestEdition = data?.editions?.[0];
  const latestDate = formatShortDate(latestEdition?.raceDate);

  return (
    <PageShell
      title="赛事详情"
      actions={
        currentUser && data ? (
          <button
            onClick={toggleFavorite}
            disabled={addFavoriteMutation.isPending || removeFavoriteMutation.isPending}
            className="p-2 -mr-2 transition-colors"
            data-testid="button-favorite"
          >
            <Heart className={`w-5 h-5 ${isFavorited ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
          </button>
        ) : undefined
      }
    >
      {isLoading && (
        <div className="py-20 text-center text-sm text-muted-foreground" data-testid="text-loading">
          正在加载赛事详情...
        </div>
      )}

      {error && (
        <div className="py-20 text-center space-y-2" data-testid="text-error">
          <p className="text-sm font-medium text-destructive">加载赛事详情失败</p>
          <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        </div>
      )}

      {data && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="space-y-5"
        >
          <div className="rounded-2xl border bg-card p-5 space-y-4" data-testid="card-hero">
            <div className="flex gap-4">
              <div className="flex flex-col items-center justify-center w-16 h-16 rounded-xl bg-primary/10 shrink-0">
                <span className="text-lg font-bold text-primary leading-none">{latestDate.day}</span>
                <span className="text-xs text-primary/70 mt-0.5">{latestDate.month}</span>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <h2 className="text-2xl font-semibold leading-tight tracking-tight" data-testid="text-marathon-name">
                  {data.name}
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {data.city || data.country || "待更新"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(latestEdition?.raceDate)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span className="font-medium">{reviewStats.average.toFixed(1)}</span>
                <span className="text-muted-foreground">/ 5</span>
              </div>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground" data-testid="text-review-count">{reviewStats.count} 条评价</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {data.websiteUrl && (
                <a href={data.websiteUrl} target="_blank" rel="noopener noreferrer" data-testid="link-website">
                  <button className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                    赛事官网
                  </button>
                </a>
              )}
              {currentUser && (
                <button
                  className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border text-sm font-medium transition-colors ${
                    isFavorited
                      ? "bg-red-50 border-red-200 text-red-600 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400"
                      : "hover:bg-accent"
                  }`}
                  onClick={toggleFavorite}
                  disabled={addFavoriteMutation.isPending || removeFavoriteMutation.isPending}
                  data-testid="button-toggle-favorite"
                >
                  <Heart className={`w-3.5 h-3.5 ${isFavorited ? "fill-current" : ""}`} />
                  {isFavorited ? "已收藏" : "收藏"}
                </button>
              )}
            </div>
          </div>

          {data.description && (
            <div className="rounded-2xl border bg-card p-5" data-testid="card-description">
              <h3 className="text-base font-semibold mb-2">赛事简介</h3>
              <p className="text-sm leading-relaxed text-foreground/80">{data.description}</p>
            </div>
          )}

          <div className="rounded-2xl border bg-card p-5" data-testid="card-editions">
            <h3 className="text-base font-semibold mb-3">历年举办</h3>
            {data.editions.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无历年信息</p>
            ) : (
              <div className="space-y-0">
                {data.editions.map((edition, index) => {
                  const edDate = formatShortDate(edition.raceDate);
                  const statusColor =
                    edition.registrationStatus === "报名中"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                      : edition.registrationStatus === "即将开始"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        : "bg-secondary text-muted-foreground";

                  return (
                    <div key={edition.id}>
                      <div
                        className="flex items-center gap-3 py-3"
                        data-testid={`edition-${edition.id}`}
                      >
                        <div className="w-10 text-center shrink-0">
                          <span className="text-sm font-semibold text-foreground">{edition.year}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-muted-foreground">
                            {edDate.month} {edDate.day}日 {edDate.weekday}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
                          {edition.registrationStatus ?? "待更新"}
                        </span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                      </div>
                      {index < data.editions.length - 1 && (
                        <div className="border-b ml-13" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-card p-5 space-y-4" data-testid="card-reviews">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">评论与评分</h3>
              <span className="text-sm text-muted-foreground">
                {reviewStats.count} 条 · 均分 {reviewStats.average.toFixed(1)}
              </span>
            </div>

            {!currentUser ? (
              <AuthCard
                isRegisterMode={isRegisterMode}
                setIsRegisterMode={setIsRegisterMode}
                authUsername={authUsername}
                setAuthUsername={setAuthUsername}
                authPassword={authPassword}
                setAuthPassword={setAuthPassword}
                onSubmit={submitAuth}
                isPending={loginMutation.isPending || registerMutation.isPending}
                prompt="登录后可发表评论"
              />
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl bg-secondary/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {currentUser.displayName || currentUser.username}
                    </span>
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => logoutMutation.mutate()}
                      data-testid="button-logout"
                    >
                      退出
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">评分</span>
                    <StarRating rating={rating} onChange={setRating} interactive />
                    <span className="text-sm font-medium">{rating}/5</span>
                  </div>
                  <textarea
                    className="w-full min-h-[80px] px-3 py-2 rounded-xl bg-background border text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="写下你对赛事的体验和建议..."
                    data-testid="textarea-review"
                  />
                  <div className="flex gap-2">
                    <button
                      className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                      onClick={submitReview}
                      disabled={createReviewMutation.isPending || updateReviewMutation.isPending}
                      data-testid="button-submit-review"
                    >
                      {editingReviewId ? "保存修改" : "发布评论"}
                    </button>
                    {editingReviewId && (
                      <button
                        className="h-9 px-4 rounded-xl border text-sm font-medium hover:bg-accent transition-colors"
                        onClick={() => {
                          setEditingReviewId(null);
                          setRating(5);
                          setComment("");
                        }}
                        data-testid="button-cancel-edit"
                      >
                        取消
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {reviews.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-reviews">暂无评论</p>
              )}
              {reviews.slice(0, 20).map((review, index) => (
                <motion.div
                  key={review.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, delay: index * 0.03 }}
                  className="rounded-xl border p-4 space-y-2.5"
                  data-testid={`review-${review.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {review.userAvatarUrl ? (
                        <img
                          src={review.userAvatarUrl}
                          alt={review.userDisplayName}
                          className="w-7 h-7 rounded-full object-cover shrink-0"
                          data-testid={`img-avatar-${review.id}`}
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-xs font-medium text-primary">
                            {(review.userDisplayName || "U").charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="text-sm font-medium truncate block" data-testid={`text-reviewer-${review.id}`}>
                          {review.userDisplayName}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-3 h-3 ${s <= review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20"}`}
                        />
                      ))}
                    </div>
                  </div>

                  <p className="text-sm text-foreground/85 leading-relaxed" data-testid={`text-comment-${review.id}`}>
                    {review.comment || "该用户未填写评论内容"}
                  </p>

                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs text-muted-foreground hover:bg-accent transition-colors"
                      onClick={async () => {
                        if (!currentUser) {
                          toast({ title: "需要登录", description: "登录后才可以点赞。", variant: "destructive" });
                          return;
                        }
                        try {
                          await likeReviewMutation.mutateAsync(review.id);
                        } catch (error) {
                          toast({ title: "操作失败", description: getFriendlyErrorMessage(error), variant: "destructive" });
                        }
                      }}
                      data-testid={`button-like-${review.id}`}
                    >
                      <ThumbsUp className="w-3 h-3" />
                      {review.likesCount > 0 && review.likesCount}
                    </button>
                    <button
                      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs text-muted-foreground hover:bg-accent transition-colors"
                      onClick={async () => {
                        if (!currentUser) {
                          toast({ title: "需要登录", description: "登录后才可以举报。", variant: "destructive" });
                          return;
                        }
                        try {
                          await reportReviewMutation.mutateAsync(review.id);
                        } catch (error) {
                          toast({ title: "操作失败", description: getFriendlyErrorMessage(error), variant: "destructive" });
                        }
                      }}
                      data-testid={`button-report-${review.id}`}
                    >
                      <Flag className="w-3 h-3" />
                    </button>
                    {currentUser && review.userId === currentUser.id && (
                      <>
                        <button
                          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs text-muted-foreground hover:bg-accent transition-colors"
                          onClick={() => {
                            setEditingReviewId(review.id);
                            setRating(review.rating);
                            setComment(review.comment ?? "");
                          }}
                          data-testid={`button-edit-${review.id}`}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs text-destructive hover:bg-destructive/10 transition-colors"
                          onClick={() => deleteReviewMutation.mutate(review.id)}
                          data-testid={`button-delete-${review.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </PageShell>
  );
}
