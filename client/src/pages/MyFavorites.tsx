import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Calendar, Heart, Loader2, MapPin } from "lucide-react";
import {
  useCurrentUser,
  useLogin,
  useMyFavorites,
  useRegister,
  useRemoveFavorite,
} from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function formatDate(dateValue?: string | null) {
  if (!dateValue) return "Unknown";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString("zh-CN");
}

export default function MyFavoritesPage() {
  const { toast } = useToast();
  const { data: currentUser, isLoading: isUserLoading } = useCurrentUser();
  const { data: favorites = [], isLoading: isFavoritesLoading } = useMyFavorites(!!currentUser);
  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const removeFavoriteMutation = useRemoveFavorite();

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");

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
          <h1 className="text-xl font-bold tracking-tight">我的收藏</h1>
        </div>

        {(isUserLoading || (currentUser && isFavoritesLoading)) && (
          <Card>
            <CardContent className="py-16 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        )}

        {!isUserLoading && !currentUser && (
          <Card>
            <CardHeader>
              <CardTitle>登录后查看收藏的赛事</CardTitle>
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
              <CardContent className="text-sm text-muted-foreground">
                已收藏赛事：{favorites.length}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>收藏列表</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {favorites.length === 0 ? (
                  <p className="text-sm text-muted-foreground">你还没有收藏任何赛事。</p>
                ) : (
                  favorites.map((item) => (
                    <div key={item.id} className="rounded-xl border p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium">{item.marathon.name}</div>
                        <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          收藏于 {formatDate(item.favoritedAt)}
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {item.marathon.city || item.marathon.country || "Unknown"}
                      </div>

                      {item.marathon.description ? (
                        <p className="text-sm text-foreground/90 line-clamp-2">
                          {item.marathon.description}
                        </p>
                      ) : null}

                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/marathons/${item.marathon.id}`}>
                          <Button variant="outline" size="sm">
                            查看赛事详情
                          </Button>
                        </Link>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => removeFavoriteMutation.mutate(item.marathon.id)}
                          disabled={removeFavoriteMutation.isPending}
                        >
                          <Heart className="w-4 h-4 mr-1 fill-current" />
                          取消收藏
                        </Button>
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
