import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { RefreshCw, Shield, Terminal } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminToken,
  listAdminMarathonSources,
  listAdminRawCrawl,
  listAdminSources,
  listAdminSyncRuns,
  runAdminSyncAll,
  setAdminToken,
  updateAdminSource,
} from "@/lib/adminApi";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

export default function AdminDataPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [search, setSearch] = useState("");
  const [configDraftById, setConfigDraftById] = useState<Record<string, string>>({});

  useEffect(() => {
    setToken(getAdminToken());
  }, []);

  const hasToken = token.trim().length > 0;

  const sourcesQuery = useQuery({
    queryKey: ["admin", "sources", token],
    queryFn: () => listAdminSources(token),
    enabled: hasToken,
  });

  const marathonSourcesQuery = useQuery({
    queryKey: ["admin", "marathon-sources", token, sourceFilter, search],
    queryFn: () =>
      listAdminMarathonSources(token, {
        limit: 80,
        sourceId: sourceFilter || undefined,
        search: search.trim() ? search.trim() : undefined,
      }),
    enabled: hasToken,
  });

  const runsQuery = useQuery({
    queryKey: ["admin", "sync-runs", token],
    queryFn: () => listAdminSyncRuns(token, 40),
    enabled: hasToken,
    refetchInterval: 10_000,
  });

  const rawQuery = useQuery({
    queryKey: ["admin", "raw-crawl", token],
    queryFn: () => listAdminRawCrawl(token, 40),
    enabled: hasToken,
  });

  const runAllMutation = useMutation({
    mutationFn: () => runAdminSyncAll(token),
    onSuccess: async () => {
      toast({ title: "已触发同步" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "sync-runs"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "raw-crawl"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "marathon-sources"] }),
      ]);
    },
    onError: (error) => {
      toast({
        title: "触发失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const updateSourceMutation = useMutation({
    mutationFn: async (params: { id: string; isActive?: boolean; priority?: number; config?: any }) =>
      updateAdminSource(token, params.id, {
        ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
        ...(params.priority !== undefined ? { priority: params.priority } : {}),
        ...(params.config !== undefined ? { config: params.config } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "sources"] });
      toast({ title: "已更新 source 配置" });
    },
    onError: (error) => {
      toast({
        title: "更新失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const sources = sourcesQuery.data?.data ?? [];
  const sourceOptions = useMemo(() => sources.map((s) => ({ id: s.id, name: s.name })), [sources]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Terminal className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-xl font-bold tracking-tight">数据采集管理（Admin）</h1>
            <Badge variant={hasToken ? "default" : "secondary"}>
              {hasToken ? "已认证" : "未认证"}
            </Badge>
          </div>
          <Link href="/">
            <Button variant="outline" size="sm">
              返回首页
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              管理员 Token
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col md:flex-row gap-2">
              <Input
                type="password"
                placeholder="ADMIN_API_TOKEN（保存到本机 localStorage）"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <Button
                variant="default"
                onClick={() => {
                  setAdminToken(token.trim());
                  toast({ title: "已保存 Token" });
                  queryClient.invalidateQueries({ queryKey: ["admin"] });
                }}
              >
                保存
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setToken("");
                  setAdminToken("");
                  queryClient.removeQueries({ queryKey: ["admin"] });
                  toast({ title: "已清除 Token" });
                }}
              >
                清除
              </Button>
            </div>

            {!hasToken ? (
              <p className="text-sm text-muted-foreground">
                需要在服务器 `.env` 设置 `ADMIN_API_TOKEN`，并在此处输入相同值后才能访问管理接口。
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Sources</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => sourcesQuery.refetch()}
                disabled={!hasToken || sourcesQuery.isFetching}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                刷新
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {sourcesQuery.error ? (
                <p className="text-sm text-destructive">
                  {getFriendlyErrorMessage(sourcesQuery.error)}
                </p>
              ) : null}

              {sources.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无数据</p>
              ) : (
                <div className="space-y-3">
                  {sources.map((source) => {
                    const configDraft =
                      configDraftById[source.id] ??
                      JSON.stringify(source.config ?? {}, null, 2);
                    return (
                      <div key={source.id} className="rounded-xl border p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{source.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {source.type} / {source.strategy} / priority={source.priority} /{" "}
                              lastRunAt={formatDateTime(source.lastRunAt)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant={source.isActive ? "default" : "outline"}
                              onClick={() =>
                                updateSourceMutation.mutate({
                                  id: source.id,
                                  isActive: !source.isActive,
                                })
                              }
                              disabled={updateSourceMutation.isPending}
                            >
                              {source.isActive ? "启用中" : "已停用"}
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-col md:flex-row gap-2">
                          <Input
                            type="number"
                            value={String(source.priority)}
                            onChange={(e) =>
                              updateSourceMutation.mutate({
                                id: source.id,
                                priority: Number(e.target.value),
                              })
                            }
                            className="md:w-40"
                          />
                          <Input value={source.baseUrl ?? ""} disabled placeholder="baseUrl" />
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">
                            config（JSON，保存后写入数据库）
                          </div>
                          <Textarea
                            value={configDraft}
                            onChange={(e) =>
                              setConfigDraftById((prev) => ({
                                ...prev,
                                [source.id]: e.target.value,
                              }))
                            }
                            rows={6}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              try {
                                const parsed = JSON.parse(configDraft);
                                updateSourceMutation.mutate({
                                  id: source.id,
                                  config: parsed,
                                });
                              } catch {
                                toast({
                                  title: "JSON 解析失败",
                                  description: "请检查 config JSON 格式。",
                                  variant: "destructive",
                                });
                              }
                            }}
                            disabled={updateSourceMutation.isPending}
                          >
                            保存 config
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>同步</CardTitle>
              <Button
                size="sm"
                onClick={() => runAllMutation.mutate()}
                disabled={!hasToken || runAllMutation.isPending}
              >
                立即同步一次
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground">
                最近 40 次运行（自动每 10s 刷新）
              </div>
              {runsQuery.error ? (
                <p className="text-sm text-destructive">{getFriendlyErrorMessage(runsQuery.error)}</p>
              ) : null}
              <div className="space-y-2">
                {(runsQuery.data?.data ?? []).map((run) => (
                  <div key={run.id} className="rounded-xl border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium truncate">{run.status}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(run.startedAt)}</div>
                    </div>
                    {run.message || run.errorMessage ? (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {(run.message || run.errorMessage) ?? ""}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Marathon Sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col md:flex-row gap-2">
              <Input
                placeholder="搜索（赛事名/canonical/url）"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Input
                placeholder="sourceId 过滤（可选）"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="md:w-80"
              />
              <Button variant="outline" onClick={() => marathonSourcesQuery.refetch()} disabled={!hasToken}>
                刷新
              </Button>
            </div>

            {marathonSourcesQuery.error ? (
              <p className="text-sm text-destructive">
                {getFriendlyErrorMessage(marathonSourcesQuery.error)}
              </p>
            ) : null}

            <div className="space-y-2">
              {(marathonSourcesQuery.data?.data ?? []).map((item) => (
                <div key={item.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {item.marathonName}{" "}
                        <span className="text-xs text-muted-foreground">({item.canonicalName})</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{item.sourceName}</div>
                    </div>
                    <Badge variant={item.isPrimary ? "default" : "secondary"}>
                      {item.isPrimary ? "primary" : "secondary"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2 break-all">{item.sourceUrl}</div>
                  <div className="text-xs text-muted-foreground mt-2">
                    lastCheckedAt={formatDateTime(item.lastCheckedAt)} / nextCheckAt=
                    {formatDateTime(item.nextCheckAt)} / status={item.lastHttpStatus ?? "-"}
                  </div>
                  {item.lastError ? (
                    <div className="text-xs text-destructive mt-2 break-all">{item.lastError}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Raw Crawl</CardTitle>
            <Button variant="outline" size="sm" onClick={() => rawQuery.refetch()} disabled={!hasToken}>
              刷新
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {(rawQuery.data?.data ?? []).map((row) => (
              <div key={row.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium truncate">{row.status}</div>
                  <div className="text-xs text-muted-foreground">{formatDateTime(row.fetchedAt)}</div>
                </div>
                <div className="text-xs text-muted-foreground mt-1 break-all">{row.sourceUrl}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  http={row.httpStatus ?? "-"} / hash={(row.contentHash ?? "").slice(0, 10)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

