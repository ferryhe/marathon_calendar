import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

interface PageShellProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}

export function PageShell({
  title,
  children,
  actions,
  backHref = "/",
  backLabel = "返回",
}: PageShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full glass-header border-b">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href={backHref}>
              <button
                className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors shrink-0"
                data-testid="button-back"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{backLabel}</span>
              </button>
            </Link>
            <h1 className="text-base font-semibold truncate" data-testid="text-page-title">{title}</h1>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}

export function AuthCard({
  isRegisterMode,
  setIsRegisterMode,
  authUsername,
  setAuthUsername,
  authPassword,
  setAuthPassword,
  onSubmit,
  isPending,
  prompt,
}: {
  isRegisterMode: boolean;
  setIsRegisterMode: (v: boolean) => void;
  authUsername: string;
  setAuthUsername: (v: string) => void;
  authPassword: string;
  setAuthPassword: (v: string) => void;
  onSubmit: () => void;
  isPending: boolean;
  prompt: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      <p className="text-sm font-medium text-muted-foreground">{prompt}</p>
      <input
        className="w-full h-10 px-3 rounded-xl bg-secondary border-0 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
        placeholder="用户名"
        value={authUsername}
        onChange={(e) => setAuthUsername(e.target.value)}
        data-testid="input-username"
      />
      <input
        className="w-full h-10 px-3 rounded-xl bg-secondary border-0 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
        type="password"
        placeholder="密码"
        value={authPassword}
        onChange={(e) => setAuthPassword(e.target.value)}
        data-testid="input-password"
      />
      <div className="flex gap-2">
        <button
          className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          onClick={onSubmit}
          disabled={isPending}
          data-testid="button-auth-submit"
        >
          {isRegisterMode ? "注册并登录" : "登录"}
        </button>
        <button
          className="h-10 px-4 rounded-xl border text-sm font-medium hover:bg-accent transition-colors"
          onClick={() => setIsRegisterMode(!isRegisterMode)}
          data-testid="button-auth-toggle"
        >
          {isRegisterMode ? "去登录" : "去注册"}
        </button>
      </div>
    </div>
  );
}
