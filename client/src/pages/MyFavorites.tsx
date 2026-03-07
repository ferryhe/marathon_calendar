import { useState } from "react";
import { Link } from "wouter";
import { Calendar, ChevronRight, Heart, Loader2, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useCurrentUser,
  useLogin,
  useMyFavorites,
  useRegister,
  useRemoveFavorite,
} from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { PageShell, AuthCard } from "@/components/PageShell";

function formatDate(dateValue?: string | null) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
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
    <PageShell
      title="我的收藏"
      actions={
        currentUser ? (
          <span className="text-sm text-muted-foreground" data-testid="text-favorites-count">
            {favorites.length} 个收藏
          </span>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {(isUserLoading || (currentUser && isFavoritesLoading)) && (
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
            prompt="登录后查看收藏的赛事"
          />
        )}

        {currentUser && !isFavoritesLoading && favorites.length === 0 && (
          <div className="rounded-2xl border bg-card p-8 text-center space-y-3">
            <Heart className="w-10 h-10 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground" data-testid="text-empty-favorites">
              你还没有收藏任何赛事
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

        {currentUser && favorites.length > 0 && (
          <AnimatePresence mode="popLayout">
            {favorites.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -60 }}
                transition={{ delay: index * 0.04, type: "spring", stiffness: 300, damping: 30 }}
                className="rounded-2xl border bg-card p-4 hover:shadow-md transition-shadow"
                data-testid={`card-favorite-${item.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Link href={`/marathons/${item.marathon.id}`} data-testid={`link-favorite-${item.id}`}>
                      <div className="flex items-center gap-2 group cursor-pointer">
                        <span
                          className="text-base font-semibold truncate group-hover:text-primary transition-colors"
                          data-testid={`text-favorite-name-${item.id}`}
                        >
                          {item.marathon.name}
                        </span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 group-hover:text-primary transition-colors" />
                      </div>
                    </Link>

                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      {(item.marathon.city || item.marathon.country) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {item.marathon.city || item.marathon.country}
                        </span>
                      )}
                      {item.favoritedAt && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          收藏于 {formatDate(item.favoritedAt)}
                        </span>
                      )}
                    </div>

                    {item.marathon.description && (
                      <p className="text-sm text-foreground/70 line-clamp-2">
                        {item.marathon.description}
                      </p>
                    )}
                  </div>

                  <button
                    className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                    onClick={() => removeFavoriteMutation.mutate(item.marathon.id)}
                    disabled={removeFavoriteMutation.isPending}
                    data-testid={`button-remove-favorite-${item.id}`}
                  >
                    <Heart className="w-4 h-4 fill-current" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </PageShell>
  );
}
