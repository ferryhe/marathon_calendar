import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import {
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle,
  Clock,
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
import { resolveEditionStatus, STATUS_I18N_KEY } from "@shared/status";
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
import { useLocalizedCity, useLocalizedName } from "@/lib/locale";
import { StatusBadge } from "@/components/StatusBadge";
import { useTranslation } from "react-i18next";

function formatDate(dateValue: string | null | undefined, lang = "zh", fallback = "—") {
  if (!dateValue) return fallback;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString(lang.startsWith("en") ? "en-US" : "zh-CN");
}

export default function MarathonDetailPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [matched, params] = useRoute("/marathons/:id");
  const marathonId = matched ? params.id : "";

  const { data, isLoading, error } = useMarathon(marathonId);
  const localizedName = useLocalizedName(data ?? {});
  const localizedCity = useLocalizedCity(data ?? {});
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
        title: isRegisterMode ? t("favorites.registerFailed") : t("favorites.loginFailed"),
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
        title: t("detail.operationFailed"),
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
        title: t("detail.operationFailed"),
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
              {t("detail.back")}
            </Button>
          </Link>
          <h1 className="text-xl font-bold tracking-tight">{t("detail.title")}</h1>
        </div>

        {isLoading && (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              {t("detail.loading")}
            </CardContent>
          </Card>
        )}

        {error && (
          <Card>
            <CardContent className="py-16 text-center">
              <p className="text-destructive font-medium">{t("detail.loadFailed")}</p>
              <p className="text-sm text-muted-foreground mt-2">{(error as Error).message}</p>
            </CardContent>
          </Card>
        )}

        {data && (() => {
          const latest = data.editions?.[0];
          const officialDocs = latest?.officialDocuments;
          const docLinks: Array<{ label: string; url?: string }> = officialDocs
            ? [
                { label: t("detail.docs.registrationNotice"), url: officialDocs.registrationNotice },
                { label: t("detail.docs.raceRules"), url: officialDocs.raceRules },
                { label: t("detail.docs.courseInfo"), url: officialDocs.courseInfo },
                { label: t("detail.docs.packetPickup"), url: officialDocs.packetPickup },
                { label: t("detail.docs.officialWebsite"), url: officialDocs.officialWebsite },
              ].filter((d) => !!d.url)
            : [];
          return (
          <>
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-start gap-2 justify-between">
                  <CardTitle className="text-2xl leading-tight">{localizedName}</CardTitle>
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
                      {data.certificationGrade}{t("detail.certificationSuffix")}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {localizedCity || data.country || t("list.locationFallback")}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {t("detail.latestRaceLabel")}{formatDate(latest?.raceDate, i18n.language, t("list.locationFallback"))}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Star className="w-4 h-4" />
                    {t("detail.ratingLabel")}{reviewStats.average.toFixed(1)} / 5
                  </span>
                  {data.organizer && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {t("detail.organizerLabel")}{data.organizer}
                    </span>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {data.description ? (
                  <p className="text-sm leading-relaxed text-foreground/90">{data.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("detail.noIntroAlt")}</p>
                )}

                <div className="flex flex-wrap gap-2">
                  {data.websiteUrl ? (
                    <a href={data.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex" data-testid="link-website-marathon">
                      <Button>{t("detail.openSite")}</Button>
                    </a>
                  ) : (
                    <Button disabled data-testid="button-no-website-marathon">{t("detail.noSite")}</Button>
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
                        ? t("detail.favorited")
                        : t("detail.favorite")
                      : t("detail.loginToFavorite")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {latest && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-500" />
                    {t("detail.timeline")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {/* Card 1: Registration Open Date — only show if available */}
                    {latest.registrationOpenDate && (
                      <div className="flex flex-col gap-1.5">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-500">
                          <Clock className="w-4 h-4" />
                        </div>
                        <p className="text-xs text-muted-foreground leading-tight">{t("detail.registrationOpens")}</p>
                        <p className="text-sm font-semibold text-blue-500">
                          {formatDate(latest.registrationOpenDate, i18n.language)}
                        </p>
                      </div>
                    )}

                    {/* Card 2: Registration Close Date — only show if available */}
                    {latest.registrationCloseDate && (
                      <div className="flex flex-col gap-1.5">
                        <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center text-orange-500">
                          <Clock className="w-4 h-4" />
                        </div>
                        <p className="text-xs text-muted-foreground leading-tight">{t("detail.registrationCloses")}</p>
                        <p className="text-sm font-semibold text-orange-500">
                          {formatDate(latest.registrationCloseDate, i18n.language)}
                        </p>
                      </div>
                    )}

                    {/* Card 3: Lottery OR Status-aware label — replaces publishedAt misuse */}
                    {!latest.isLottery ? (
                      (() => {
                        const resolved = resolveEditionStatus({
                          status: latest.status,
                          legacyStatus: latest.registrationStatus,
                          raceDate: latest.raceDate,
                          registrationStart: latest.registrationOpenDate,
                          registrationEnd: latest.registrationCloseDate,
                        });
                        const labelKey = STATUS_I18N_KEY[resolved] ?? "detail.registrationDetails";
                        return (
                          <div className="flex flex-col gap-1.5">
                            <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center text-purple-500">
                              <CheckCircle className="w-4 h-4" />
                            </div>
                            <p className="text-xs text-muted-foreground leading-tight">
                              {t(labelKey)}
                            </p>
                            {latest.registrationStatus ? (
                              <p className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                                {latest.registrationStatus}
                              </p>
                            ) : (
                              <p className="text-sm text-muted-foreground">—</p>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center text-purple-500">
                          <CheckCircle className="w-4 h-4" />
                        </div>
                        <p className="text-xs text-muted-foreground leading-tight">{t("detail.lotteryResult")}</p>
                        <p className="text-sm text-muted-foreground">—</p>
                        <p className="text-[10px] text-muted-foreground">{t("detail.lotteryHint")}</p>
                      </div>
                    )}

                    {/* Card 4: Race Date — always show if available */}
                    {latest.raceDate && (
                      <div className="flex flex-col gap-1.5">
                        <div className="w-9 h-9 rounded-xl bg-green-50 dark:bg-green-500/10 flex items-center justify-center text-green-500">
                          <Flag className="w-4 h-4" />
                        </div>
                        <p className="text-xs text-muted-foreground leading-tight">{t("detail.raceDay")}</p>
                        <p className="text-sm font-semibold text-green-500">
                          {formatDate(latest.raceDate, i18n.language)}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {latest?.highlights && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-yellow-500" />
                    {t("detail.highlights")}
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
                  <CardTitle>{t("detail.raceInfo")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {latest.distanceOptions && latest.distanceOptions.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">{t("detail.items")}</p>
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
                                <span>{t("detail.capacity", { count: d.capacity })}</span>
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
                          <p className="text-xs text-muted-foreground mb-1">{t("detail.start")}</p>
                          <p className="font-medium">{latest.startLocation}</p>
                        </div>
                      )}
                      {latest.finishLocation && (
                        <div className="rounded-xl border p-3 text-sm" data-testid="text-finish-location">
                          <p className="text-xs text-muted-foreground mb-1">{t("detail.finish")}</p>
                          <p className="font-medium">{latest.finishLocation}</p>
                        </div>
                      )}
                      {latest.packetPickupLocation && (
                        <div className="rounded-xl border p-3 text-sm" data-testid="text-pickup-location">
                          <p className="text-xs text-muted-foreground mb-1">{t("detail.pickup")}</p>
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
                  <CardTitle>{t("detail.medals")}</CardTitle>
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
                          alt={t("detail.medalAlt", { n: i + 1 })}
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
                    {t("detail.officialInfo")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {docLinks.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">{t("detail.officialDocs")}</p>
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
                        {t("detail.registrationChannels")}
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
                      <span className="text-xs text-muted-foreground">{t("detail.officialAccountLabel")}</span>
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
                <CardTitle>{t("detail.history")}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.editions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("detail.noHistory")}</p>
                ) : (
                  <div className="space-y-3">
                    {data.editions.map((edition) => {
                      return (
                        <div
                          key={edition.id}
                          className="rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-medium">{edition.year}{t("detail.yearSuffix")}</p>
                            <p className="text-xs text-muted-foreground">
                              {t("detail.raceDateLabel")}{formatDate(edition.raceDate, i18n.language, t("status.pending"))}
                            </p>
                          </div>
                          <StatusBadge
                            status={edition.status}
                            legacyStatus={edition.registrationStatus}
                            raceDate={edition.raceDate}
                            registrationStart={edition.registrationOpenDate}
                            registrationEnd={edition.registrationCloseDate}
                            size="md"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {data.sources && data.sources.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("detail.otherSources")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3">
                    {t("detail.sourceHint")}
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
                          <Badge variant="secondary" className="flex-shrink-0">{t("detail.primarySource")}</Badge>
                        )}
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>{t("detail.reviews")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  {t("detail.reviewsSummary", { count: reviewStats.count, avg: reviewStats.average.toFixed(1) })}
                </div>

                {!currentUser ? (
                  <div className="rounded-xl border p-4 space-y-3 bg-secondary/20">
                    <div className="text-sm font-medium">{t("detail.loginToReview")}</div>
                    <Input
                      placeholder={t("detail.usernamePlaceholder")}
                      value={authUsername}
                      onChange={(event) => setAuthUsername(event.target.value)}
                    />
                    <Input
                      type="password"
                      placeholder={t("detail.passwordPlaceholder")}
                      value={authPassword}
                      onChange={(event) => setAuthPassword(event.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={submitAuth}
                        disabled={loginMutation.isPending || registerMutation.isPending}
                      >
                        {isRegisterMode ? t("favorites.registerSubmit") : t("favorites.loginSubmit")}
                      </Button>
                      <Button variant="outline" onClick={() => setIsRegisterMode((value) => !value)}>
                        {isRegisterMode ? t("favorites.switchToLogin") : t("favorites.switchToRegister")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl border p-4 space-y-3 bg-secondary/20">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {t("detail.currentUser", { name: currentUser.displayName || currentUser.username })}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => logoutMutation.mutate()}>
                          {t("detail.logout")}
                        </Button>
                      </div>
                      <div className="flex gap-2 items-center">
                        <span className="text-sm">{t("detail.rating")}</span>
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
                        placeholder={t("detail.commentPlaceholder")}
                      />
                      <div className="flex gap-2">
                        <Button onClick={submitReview}>
                          {editingReviewId ? t("detail.saveEdit") : t("detail.publishReview")}
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
                            {t("detail.cancelEdit")}
                          </Button>
                        )}
                      </div>
                    </div>

                    {reviews.length === 0 ? <p className="text-sm text-muted-foreground">{t("detail.noReviewsYet")}</p> : null}

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
                              {review.userDisplayName} · {t("detail.userPoints", { score: review.rating })}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {formatDate(review.createdAt)}
                          </span>
                        </div>

                        <p className="text-sm text-foreground/90">
                          {review.comment || t("detail.userNoComment")}
                        </p>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (!currentUser) {
                                toast({
                                  title: t("detail.loginToLikeTitle"),
                                  description: t("detail.loginToLikeHint"),
                                  variant: "destructive",
                                });
                                return;
                              }
                              try {
                                await likeReviewMutation.mutateAsync(review.id);
                              } catch (error) {
                                toast({
                                  title: t("detail.operationFailed"),
                                  description: getFriendlyErrorMessage(error),
                                  variant: "destructive",
                                });
                              }
                            }}
                          >
                            <ThumbsUp className="w-4 h-4 mr-1" />
                            {t("detail.like")} {review.likesCount}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (!currentUser) {
                                toast({
                                  title: t("detail.loginToReportTitle"),
                                  description: t("detail.loginToReportHint"),
                                  variant: "destructive",
                                });
                                return;
                              }
                              try {
                                await reportReviewMutation.mutateAsync(review.id);
                              } catch (error) {
                                toast({
                                  title: t("detail.operationFailed"),
                                  description: getFriendlyErrorMessage(error),
                                  variant: "destructive",
                                });
                              }
                            }}
                          >
                            <Flag className="w-4 h-4 mr-1" />
                            {t("detail.report")} {review.reportCount}
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
                                {t("detail.edit")}
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => deleteReviewMutation.mutate(review.id)}
                              >
                                {t("detail.delete")}
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
