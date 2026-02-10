import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import {
  ArrowLeft,
  Calendar,
  Flag,
  Heart,
  MapPin,
  Star,
  ThumbsUp,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function formatDate(dateValue?: string | null) {
  if (!dateValue) return "待更新";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "待更新";
  return date.toLocaleDateString("zh-CN");
}

export default function MarathonDetailPage() {
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

    if (isRegisterMode) {
      await registerMutation.mutateAsync({
        username: authUsername,
        password: authPassword,
      });
    } else {
      await loginMutation.mutateAsync({
        username: authUsername,
        password: authPassword,
      });
    }
    setAuthPassword("");
  };

  const toggleFavorite = async () => {
    if (!currentUser || !marathonId) return;
    if (isFavorited) {
      await removeFavoriteMutation.mutateAsync(marathonId);
    } else {
      await addFavoriteMutation.mutateAsync(marathonId);
    }
  };

  const submitReview = async () => {
    if (!comment.trim()) return;

    if (editingReviewId) {
      await updateReviewMutation.mutateAsync({
        reviewId: editingReviewId,
        payload: { rating, comment },
      });
      setEditingReviewId(null);
    } else {
      await createReviewMutation.mutateAsync({
        rating,
        comment,
        marathonEditionId: data?.editions?.[0]?.id,
      });
    }

    setRating(5);
    setComment("");
  };

  if (!matched) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="outline" size="sm" className="rounded-full">
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回列表
            </Button>
          </Link>
          <h1 className="text-xl font-bold tracking-tight">赛事详情</h1>
        </div>

        {isLoading && (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              正在加载赛事详情...
            </CardContent>
          </Card>
        )}

        {error && (
          <Card>
            <CardContent className="py-16 text-center">
              <p className="text-destructive font-medium">加载赛事详情失败</p>
              <p className="text-sm text-muted-foreground mt-2">{(error as Error).message}</p>
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            <Card>
              <CardHeader className="space-y-3">
                <CardTitle className="text-2xl leading-tight">{data.name}</CardTitle>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {data.city || data.country || "待更新"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    最近赛事：{formatDate(data.editions?.[0]?.raceDate)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Star className="w-4 h-4" />
                    评分：{reviewStats.average.toFixed(1)} / 5
                  </span>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {data.description ? (
                  <p className="text-sm leading-relaxed text-foreground/90">{data.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">暂无赛事简介</p>
                )}

                <div className="flex flex-wrap gap-2">
                  {data.websiteUrl && (
                    <a href={data.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex">
                      <Button>前往赛事官网</Button>
                    </a>
                  )}
                  <Button
                    variant={isFavorited ? "default" : "outline"}
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
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>历年举办信息</CardTitle>
              </CardHeader>
              <CardContent>
                {data.editions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无历年信息</p>
                ) : (
                  <div className="space-y-3">
                    {data.editions.map((edition) => (
                      <div
                        key={edition.id}
                        className="rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{edition.year} 年赛事</p>
                          <p className="text-xs text-muted-foreground">
                            比赛日期：{formatDate(edition.raceDate)}
                          </p>
                        </div>
                        <Badge variant="secondary">{edition.registrationStatus ?? "待更新"}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>评论与评分</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  共 {reviewStats.count} 条评论，平均分 {reviewStats.average.toFixed(1)}
                </div>

                {!currentUser ? (
                  <div className="rounded-xl border p-4 space-y-3 bg-secondary/20">
                    <div className="text-sm font-medium">登录后可发表评论、编辑和删除自己的评论</div>
                    <Input
                      placeholder="用户名（3-30位，字母数字下划线）"
                      value={authUsername}
                      onChange={(event) => setAuthUsername(event.target.value)}
                    />
                    <Input
                      type="password"
                      placeholder="密码（至少6位）"
                      value={authPassword}
                      onChange={(event) => setAuthPassword(event.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={submitAuth}
                        disabled={loginMutation.isPending || registerMutation.isPending}
                      >
                        {isRegisterMode ? "注册并登录" : "登录"}
                      </Button>
                      <Button variant="outline" onClick={() => setIsRegisterMode((value) => !value)}>
                        {isRegisterMode ? "切换登录" : "切换注册"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl border p-4 space-y-3 bg-secondary/20">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          当前用户：{currentUser.displayName || currentUser.username}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => logoutMutation.mutate()}>
                          退出登录
                        </Button>
                      </div>
                      <div className="flex gap-2 items-center">
                        <span className="text-sm">评分</span>
                        <Input
                          type="number"
                          min={1}
                          max={5}
                          value={rating}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            setRating(Number.isNaN(value) ? 5 : Math.max(1, Math.min(5, value)));
                          }}
                          className="w-24"
                        />
                      </div>
                      <Textarea
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        placeholder="写下你对赛事的体验和建议..."
                      />
                      <div className="flex gap-2">
                        <Button onClick={submitReview}>
                          {editingReviewId ? "保存修改" : "发布评论"}
                        </Button>
                        {editingReviewId && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setEditingReviewId(null);
                              setRating(5);
                              setComment("");
                            }}
                          >
                            取消编辑
                          </Button>
                        )}
                      </div>
                    </div>

                    {reviews.length === 0 ? <p className="text-sm text-muted-foreground">暂无评论</p> : null}

                    {reviews.slice(0, 20).map((review) => (
                      <div key={review.id} className="rounded-xl border p-4 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {review.userAvatarUrl ? (
                              <img
                                src={review.userAvatarUrl}
                                alt={review.userDisplayName}
                                className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                              />
                            ) : null}
                            <span className="text-sm font-medium truncate">
                              {review.userDisplayName} · {review.rating} 分
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {formatDate(review.createdAt)}
                          </span>
                        </div>

                        <p className="text-sm text-foreground/90">
                          {review.comment || "该用户未填写评论内容"}
                        </p>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => likeReviewMutation.mutate(review.id)}
                          >
                            <ThumbsUp className="w-4 h-4 mr-1" />
                            点赞 {review.likesCount}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => reportReviewMutation.mutate(review.id)}
                          >
                            <Flag className="w-4 h-4 mr-1" />
                            举报 {review.reportCount}
                          </Button>
                          {review.userId === currentUser.id && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingReviewId(review.id);
                                  setRating(review.rating);
                                  setComment(review.comment ?? "");
                                }}
                              >
                                编辑
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => deleteReviewMutation.mutate(review.id)}
                              >
                                删除
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
