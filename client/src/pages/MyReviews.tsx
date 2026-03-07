import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Calendar, ChevronRight, Loader2, MapPin, MessageSquare, Star } from "lucide-react";
import { motion } from "framer-motion";
import { useCurrentUser, useLogin, useMyReviews, useRegister } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { PageShell, AuthCard } from "@/components/PageShell";

function formatDate(dateValue?: string | null) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN");
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-3.5 h-3.5 ${
            star <= rating ? "text-amber-500 fill-amber-500" : "text-muted-foreground/20"
          }`}
        />
      ))}
    </div>
  );
}

export default function MyReviewsPage() {
  const { toast } = useToast();
  const { data: currentUser, isLoading: isUserLoading } = useCurrentUser();
  const { data: myReviews = [], isLoading: isReviewsLoading } = useMyReviews(!!currentUser);
  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const stats = useMemo(() => {
    if (myReviews.length === 0) return { total: 0, averageRating: 0 };
    const totalRating = myReviews.reduce((sum, review) => sum + review.rating, 0);
    return { total: myReviews.length, averageRating: totalRating / myReviews.length };
  }, [myReviews]);

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

  return (
    <PageShell title="我的评论">
      <div className="space-y-4">
        {(isUserLoading || (currentUser && isReviewsLoading)) && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isUserLoading && !currentUser && (
          <AuthCard
            isRegisterMode={isRegisterMode}
            setIsRegisterMode={setIsRegisterMode}
            authUsername={authUsername}
            setAuthUsername={setAuthUsername}
            authPassword={authPassword}
            setAuthPassword={setAuthPassword}
            onSubmit={submitAuth}
            isPending={loginMutation.isPending || registerMutation.isPending}
            prompt="登录后查看你的评论历史"
          />
        )}

        {currentUser && !isReviewsLoading && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border bg-card p-4 text-center">
                <div className="text-2xl font-semibold" data-testid="text-reviews-count">
                  {stats.total}
                </div>
                <div className="text-sm text-muted-foreground mt-1">评论总数</div>
              </div>
              <div className="rounded-2xl border bg-card p-4 text-center">
                <div className="text-2xl font-semibold" data-testid="text-reviews-avg-rating">
                  {stats.averageRating.toFixed(1)}
                </div>
                <div className="text-sm text-muted-foreground mt-1">平均评分</div>
              </div>
            </div>

            {myReviews.length === 0 && (
              <div className="rounded-2xl border bg-card p-8 text-center space-y-3">
                <MessageSquare className="w-10 h-10 mx-auto text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground" data-testid="text-empty-reviews">
                  你还没有发布过评论
                </p>
                <Link href="/">
                  <button
                    className="text-sm text-primary hover:text-primary/80 transition-colors"
                    data-testid="link-browse-events"
                  >
                    去发现赛事 →
                  </button>
                </Link>
              </div>
            )}

            {myReviews.map((review, index) => (
              <motion.div
                key={review.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04, type: "spring", stiffness: 300, damping: 30 }}
                className="rounded-2xl border bg-card p-4 space-y-3 hover:shadow-md transition-shadow"
                data-testid={`card-review-${review.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/marathons/${review.marathon.id}`} data-testid={`link-review-${review.id}`}>
                    <div className="flex items-center gap-2 group cursor-pointer min-w-0">
                      <span
                        className="text-base font-semibold truncate group-hover:text-primary transition-colors"
                        data-testid={`text-review-marathon-${review.id}`}
                      >
                        {review.marathon.name}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 group-hover:text-primary transition-colors" />
                    </div>
                  </Link>
                  <StarRating rating={review.rating} />
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  {(review.marathon.city || review.marathon.country) && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {review.marathon.city || review.marathon.country}
                    </span>
                  )}
                  {review.createdAt && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(review.createdAt)}
                    </span>
                  )}
                </div>

                {review.comment && (
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    {review.comment}
                  </p>
                )}

                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1" data-testid={`text-review-likes-${review.id}`}>
                    ♥ {review.likesCount}
                  </span>
                  {review.reportCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-500" data-testid={`text-review-reports-${review.id}`}>
                      ⚠ {review.reportCount}
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </>
        )}
      </div>
    </PageShell>
  );
}
