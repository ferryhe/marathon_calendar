import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Calendar, Loader2, MapPin, MessageSquare, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCurrentUser, useLogin, useMyReviews, useRegister } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pickLocalizedCity, pickLocalizedName, useLocale } from "@/lib/locale";

function formatDate(dateValue: string | null | undefined, lang: string) {
  if (!dateValue) return "—";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(lang.startsWith("en") ? "en-US" : "zh-CN");
}

export default function MyReviewsPage() {
  const { t, i18n } = useTranslation();
  const locale = useLocale();
  const { toast } = useToast();
  const { data: currentUser, isLoading: isUserLoading } = useCurrentUser();
  const { data: myReviews = [], isLoading: isReviewsLoading } = useMyReviews(!!currentUser);
  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const stats = useMemo(() => {
    if (myReviews.length === 0) {
      return { total: 0, averageRating: 0 };
    }

    const totalRating = myReviews.reduce((sum, review) => sum + review.rating, 0);
    return {
      total: myReviews.length,
      averageRating: totalRating / myReviews.length,
    };
  }, [myReviews]);

  const submitAuth = async () => {
    if (!authUsername || !authPassword) {
      return;
    }

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

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="outline" size="sm" className="rounded-full">
              <ArrowLeft className="w-4 h-4 mr-1" />
              {t("myReviews.back")}
            </Button>
          </Link>
          <h1 className="text-xl font-bold tracking-tight">{t("myReviews.title")}</h1>
        </div>

        {(isUserLoading || (currentUser && isReviewsLoading)) && (
          <Card>
            <CardContent className="py-16 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        )}

        {!isUserLoading && !currentUser && (
          <Card>
            <CardHeader>
              <CardTitle>{t("myReviews.loginPrompt")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder={t("favorites.username")}
                value={authUsername}
                onChange={(event) => setAuthUsername(event.target.value)}
              />
              <Input
                type="password"
                placeholder={t("favorites.password")}
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
            </CardContent>
          </Card>
        )}

        {currentUser && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{currentUser.username}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border p-4">
                  <div className="text-muted-foreground">{t("myReviews.totalReviews")}</div>
                  <div className="text-2xl font-semibold mt-1">{stats.total}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-muted-foreground">{t("myReviews.averageRating")}</div>
                  <div className="text-2xl font-semibold mt-1">{stats.averageRating.toFixed(1)}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("myReviews.list")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {myReviews.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("myReviews.empty")}</p>
                ) : (
                  myReviews.map((review) => {
                    const localizedName = pickLocalizedName(review.marathon, locale);
                    const localizedCity = pickLocalizedCity(review.marathon, locale);
                    return (
                      <div key={review.id} className="rounded-xl border p-4 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-medium">{localizedName}</div>
                          <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(review.createdAt, i18n.language)}
                          </div>
                        </div>

                        <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {localizedCity || review.marathon.country || t("common.unknown")}
                        </div>

                        <div className="text-sm inline-flex items-center gap-1">
                          <Star className="w-4 h-4 text-amber-500" />
                          {review.rating} / 5
                        </div>

                        <p className="text-sm text-foreground/90">
                          {review.comment || t("myReviews.noText")}
                        </p>

                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {t("myReviews.likesReports", { likes: review.likesCount, reports: review.reportCount })}
                          </span>
                          <Link href={`/marathons/${review.marathon.id}`}>
                            <Button variant="outline" size="sm">
                              {t("detail.viewMarathonDetail")}
                            </Button>
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
