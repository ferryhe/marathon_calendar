import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import {
  ArrowLeft,
  Award,
  Calendar,
  ExternalLink,
  FileText,
  Flag,
  Heart,
  MapPin,
  Smartphone,
  Sparkles,
  Star,
  ThumbsUp,
  Users,
} from "lucide-react";
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

        {data && (() => {
          const latest = data.editions?.[0];
          const officialDocs = latest?.officialDocuments;
          const docLinks: Array<{ label: string; url?: string }> = officialDocs
            ? [
                { label: "报名须知", url: officialDocs.registrationNotice },
                { label: "竞赛规程", url: officialDocs.raceRules },
                { label: "赛道信息", url: officialDocs.courseInfo },
                { label: "领物指南", url: officialDocs.packetPickup },
                { label: "官方网站", url: officialDocs.officialWebsite },
              ].filter((d) => !!d.url)
            : [];
          return (
          <>
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-start gap-2 justify-between">
                  <CardTitle className="text-2xl leading-tight">{data.name}</CardTitle>
                  {data.certificationGrade && (
                    <Badge
                      variant="secondary"
                      className={
                        data.certificationGrade === "A"
                          ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                          : data.certificationGrade === "B"
                            ? "bg-gray-200 text-gray-800 border-gray-300"
                            : "bg-orange-100 text-orange-800 border-orange-300"
                      }
                      data-testid={`badge-cert-${data.certificationGrade}`}
                    >
                      <Award className="w-3 h-3 mr-1" />
                      {data.certificationGrade} 类认证
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {data.city || data.country || "待更新"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    最近赛事：{formatDate(latest?.raceDate)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Star className="w-4 h-4" />
                    评分：{reviewStats.average.toFixed(1)} / 5
                  </span>
                  {data.organizer && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      主办：{data.organizer}
                    </span>
                  )}
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

            {latest?.highlights && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-yellow-500" />
                    赛事亮点
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line"
                    data-testid="text-highlights"
                  >
                    {latest.highlights}
                  </p>
                </CardContent>
              </Card>
            )}

            {(latest?.distanceOptions?.length ||
              latest?.startLocation ||
              latest?.finishLocation ||
              latest?.packetPickupLocation) && (
              <Card>
                <CardHeader>
                  <CardTitle>赛事信息</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {latest.distanceOptions && latest.distanceOptions.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">设项</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {latest.distanceOptions.map((d, i) => (
                          <div
                            key={i}
                            className="rounded-xl border p-3 text-sm"
                            data-testid={`card-distance-${i}`}
                          >
                            <div className="font-medium">{d.kind}</div>
                            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                              {typeof d.capacity === "number" && (
                                <span>{d.capacity.toLocaleString()} 人</span>
                              )}
                              {typeof d.price === "number" && <span>¥{d.price}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(latest.startLocation || latest.finishLocation || latest.packetPickupLocation) && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {latest.startLocation && (
                        <div className="rounded-xl border p-3 text-sm" data-testid="text-start-location">
                          <p className="text-xs text-muted-foreground mb-1">起点</p>
                          <p className="font-medium">{latest.startLocation}</p>
                        </div>
                      )}
                      {latest.finishLocation && (
                        <div className="rounded-xl border p-3 text-sm" data-testid="text-finish-location">
                          <p className="text-xs text-muted-foreground mb-1">终点</p>
                          <p className="font-medium">{latest.finishLocation}</p>
                        </div>
                      )}
                      {latest.packetPickupLocation && (
                        <div className="rounded-xl border p-3 text-sm" data-testid="text-pickup-location">
                          <p className="text-xs text-muted-foreground mb-1">领物</p>
                          <p className="font-medium">{latest.packetPickupLocation}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {latest?.medalImageUrls && latest.medalImageUrls.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>赛事奖牌</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                    {latest.medalImageUrls.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-xl border overflow-hidden bg-secondary/20 aspect-square"
                        data-testid={`img-medal-${i}`}
                      >
                        <img
                          src={url}
                          alt={`奖牌 ${i + 1}`}
                          className="w-full h-full object-contain"
                          loading="lazy"
                        />
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {(docLinks.length > 0 ||
              (latest?.registrationChannels && latest.registrationChannels.length > 0) ||
              data.officialWechatAccount) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    报名与官方信息
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {docLinks.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">官方文档</p>
                      <div className="flex flex-wrap gap-2">
                        {docLinks.map((d) => (
                          <a
                            key={d.label}
                            href={d.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`link-doc-${d.label}`}
                          >
                            <Button variant="outline" size="sm">
                              <ExternalLink className="w-3 h-3 mr-1" />
                              {d.label}
                            </Button>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {latest?.registrationChannels && latest.registrationChannels.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <Smartphone className="w-3 h-3" />
                        报名渠道
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {latest.registrationChannels.map((ch, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            data-testid={`badge-channel-${i}`}
                          >
                            {ch}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {data.officialWechatAccount && (
                    <div className="text-sm">
                      <span className="text-xs text-muted-foreground">官方公众号：</span>
                      <span className="font-medium" data-testid="text-wechat-account">
                        {data.officialWechatAccount}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

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

            {data.sources && data.sources.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>其他信息源</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3">
                    本页信息来自以下采集源，可点击查看原始页面以获取最新或更详细内容
                  </p>
                  <div className="space-y-2">
                    {data.sources.map((source) => (
                      <a
                        key={source.id}
                        href={source.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 rounded-xl border p-3 hover:bg-secondary/30 transition-colors"
                        data-testid={`link-source-${source.id}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <ExternalLink className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {source.sourceId}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {source.sourceUrl}
                            </p>
                          </div>
                        </div>
                        {source.isPrimary && (
                          <Badge variant="secondary" className="flex-shrink-0">主源</Badge>
                        )}
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

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
                            onClick={async () => {
                              if (!currentUser) {
                                toast({
                                  title: "需要登录",
                                  description: "登录后才可以点赞。",
                                  variant: "destructive",
                                });
                                return;
                              }
                              try {
                                await likeReviewMutation.mutateAsync(review.id);
                              } catch (error) {
                                toast({
                                  title: "操作失败",
                                  description: getFriendlyErrorMessage(error),
                                  variant: "destructive",
                                });
                              }
                            }}
                          >
                            <ThumbsUp className="w-4 h-4 mr-1" />
                            点赞 {review.likesCount}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (!currentUser) {
                                toast({
                                  title: "需要登录",
                                  description: "登录后才可以举报。",
                                  variant: "destructive",
                                });
                                return;
                              }
                              try {
                                await reportReviewMutation.mutateAsync(review.id);
                              } catch (error) {
                                toast({
                                  title: "操作失败",
                                  description: getFriendlyErrorMessage(error),
                                  variant: "destructive",
                                });
                              }
                            }}
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
          );
        })()}
      </div>
    </div>
  );
}
