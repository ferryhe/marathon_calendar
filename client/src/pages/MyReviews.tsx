import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Calendar, Loader2, MapPin, MessageSquare, Star } from "lucide-react";
import { useCurrentUser, useLogin, useMyReviews, useRegister } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function formatDate(dateValue?: string | null) {
  if (!dateValue) {
    return "Unknown";
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleDateString("zh-CN");
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
        title: isRegisterMode ? "注册失败" : "登录失败",
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
              返回首页
            </Button>
          </Link>
          <h1 className="text-xl font-bold tracking-tight">我的评论</h1>
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
              <CardTitle>登录后查看你的评论历史</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="用户名"
                value={authUsername}
                onChange={(event) => setAuthUsername(event.target.value)}
              />
              <Input
                type="password"
                placeholder="密码"
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
                  <div className="text-muted-foreground">评论总数</div>
                  <div className="text-2xl font-semibold mt-1">{stats.total}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-muted-foreground">平均评分</div>
                  <div className="text-2xl font-semibold mt-1">{stats.averageRating.toFixed(1)}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>评论列表</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {myReviews.length === 0 ? (
                  <p className="text-sm text-muted-foreground">你还没有发布过评论。</p>
                ) : (
                  myReviews.map((review) => (
                    <div key={review.id} className="rounded-xl border p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium">{review.marathon.name}</div>
                        <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(review.createdAt)}
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {review.marathon.city || review.marathon.country || "Unknown"}
                      </div>

                      <div className="text-sm inline-flex items-center gap-1">
                        <Star className="w-4 h-4 text-amber-500" />
                        {review.rating} / 5
                      </div>

                      <p className="text-sm text-foreground/90">
                        {review.comment || "No text comment."}
                      </p>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          Likes {review.likesCount} · Reports {review.reportCount}
                        </span>
                        <Link href={`/marathons/${review.marathon.id}`}>
                          <Button variant="outline" size="sm">
                            查看赛事详情
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
