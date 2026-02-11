import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { RefreshCw, Shield, Terminal, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminDiscoveryWebSearch,
  adminDiscoveryList,
  generateAdminAiRuleTemplate,
  getAdminToken,
  getAdminStats,
  getAdminRawCrawl,
  ignoreAdminRawCrawl,
  listAdminMarathons,
  listAdminMarathonSources,
  listAdminRawCrawlFiltered,
  listAdminSources,
  lookupAdminMarathonSource,
  listAdminSyncRuns,
  resolveAdminRawCrawl,
  runAdminSyncAll,
  runAdminSyncMarathonSource,
  setAdminToken,
  upsertAdminMarathonSource,
  updateAdminSource,
} from "@/lib/adminApi";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const [discoveryQuery, setDiscoveryQuery] = useState("");
  const [configDraftById, setConfigDraftById] = useState<Record<string, string>>({});
  const [rawStatus, setRawStatus] = useState<string>("needs_review");
  const [selectedRawId, setSelectedRawId] = useState<string | null>(null);

  const [bindMarathonSearch, setBindMarathonSearch] = useState("");
  const [bindMarathonId, setBindMarathonId] = useState("");
  const [bindSourceId, setBindSourceId] = useState("");
  const [bindUrl, setBindUrl] = useState("");
  const [bindPrimary, setBindPrimary] = useState(false);

  const [listDiscoverySourceId, setListDiscoverySourceId] = useState("");
  const [listDiscoveryUrl, setListDiscoveryUrl] = useState("");

  const [resolveYear, setResolveYear] = useState("");
  const [resolveRaceDate, setResolveRaceDate] = useState("");
  const [resolveStatus, setResolveStatus] = useState("");
  const [resolveRegUrl, setResolveRegUrl] = useState("");
  const [resolveNote, setResolveNote] = useState("");
  const [resolvePublish, setResolvePublish] = useState(true);
  const [aiTemplateDraft, setAiTemplateDraft] = useState<string>("");

  useEffect(() => {
    setToken(getAdminToken());
  }, []);

  const hasToken = token.trim().length > 0;
  const [tab, setTab] = useState<string>(() => {
    try {
      return localStorage.getItem("mc_admin_tab") ?? "overview";
    } catch {
      return "overview";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("mc_admin_tab", tab);
    } catch {
      // ignore
    }
  }, [tab]);

  const statsQuery = useQuery({
    queryKey: ["admin", "stats", token],
    queryFn: () => getAdminStats(token),
    enabled: hasToken && tab === "overview",
    refetchInterval: 15_000,
  });

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
    enabled: hasToken && tab === "binding",
  });

  const runsQuery = useQuery({
    queryKey: ["admin", "sync-runs", token],
    queryFn: () => listAdminSyncRuns(token, 40),
    enabled: hasToken && tab === "runs",
    refetchInterval: 10_000,
  });

  const rawQuery = useQuery({
    queryKey: ["admin", "raw-crawl", token, rawStatus],
    queryFn: () =>
      listAdminRawCrawlFiltered(token, {
        limit: 60,
        status: rawStatus || undefined,
      }),
    enabled: hasToken && tab === "review",
  });

  const rawDetailQuery = useQuery({
    queryKey: ["admin", "raw-crawl-detail", token, selectedRawId],
    queryFn: () => getAdminRawCrawl(token, selectedRawId!, false),
    enabled: hasToken && Boolean(selectedRawId),
  });

  useEffect(() => {
    const row = rawDetailQuery.data?.data;
    if (!row) return;
    const meta = row.metadata as any;
    const ext = meta?.extraction;
    if (ext && typeof ext === "object") {
      setResolveRaceDate(typeof ext.raceDate === "string" ? ext.raceDate : "");
      setResolveStatus(typeof ext.registrationStatus === "string" ? ext.registrationStatus : "");
      setResolveRegUrl(typeof ext.registrationUrl === "string" ? ext.registrationUrl : "");
      setResolvePublish(true);
      setAiTemplateDraft("");
      if (typeof ext.raceDate === "string" && ext.raceDate.length >= 4) {
        setResolveYear(ext.raceDate.slice(0, 4));
      }
    }
  }, [rawDetailQuery.data]);

  const marathonsQuery = useQuery({
    queryKey: ["admin", "marathons", token, bindMarathonSearch],
    queryFn: () =>
      listAdminMarathons(token, {
        limit: 20,
        search: bindMarathonSearch.trim(),
      }),
    enabled: hasToken && tab === "binding" && bindMarathonSearch.trim().length > 0,
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

  const discoveryMutation = useMutation({
    mutationFn: async () =>
      adminDiscoveryWebSearch(token, { q: discoveryQ.trim(), count: 10 }),
    onError: (error) => {
      toast({
        title: "Search failed",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const listDiscoveryMutation = useMutation({
    mutationFn: async () =>
      adminDiscoveryList(token, { sourceId: listDiscoverySourceId, listUrl: listDiscoveryUrl.trim() }),
    onError: (error) => {
      toast({
        title: "列表发现失败",
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

  const bindMutation = useMutation({
    mutationFn: async () =>
      upsertAdminMarathonSource(token, {
        marathonId: bindMarathonId,
        sourceId: bindSourceId,
        sourceUrl: bindUrl.trim(),
        isPrimary: bindPrimary,
      }),
    onSuccess: async () => {
      toast({ title: "已绑定 Marathon Source" });
      await queryClient.invalidateQueries({ queryKey: ["admin", "marathon-sources"] });
    },
    onError: (error) => {
      toast({
        title: "绑定失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const ignoreRawMutation = useMutation({
    mutationFn: async (id: string) => ignoreAdminRawCrawl(token, id),
    onSuccess: async () => {
      toast({ title: "已忽略" });
      await queryClient.invalidateQueries({ queryKey: ["admin", "raw-crawl"] });
    },
    onError: (error) => {
      toast({
        title: "操作失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const resolveRawMutation = useMutation({
    mutationFn: async (id: string) =>
      resolveAdminRawCrawl(token, id, {
        ...(resolveYear.trim() ? { year: Number(resolveYear) } : {}),
        ...(resolveRaceDate.trim() ? { raceDate: resolveRaceDate.trim() } : {}),
        ...(resolveStatus.trim() ? { registrationStatus: resolveStatus.trim() } : {}),
        ...(resolveRegUrl.trim() ? { registrationUrl: resolveRegUrl.trim() } : {}),
        note: resolveNote.trim() ? resolveNote.trim() : undefined,
        publish: resolvePublish,
      }),
    onSuccess: async () => {
      toast({ title: "已回填并标记为 processed" });
      setSelectedRawId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "raw-crawl"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "marathon-sources"] }),
      ]);
    },
    onError: (error) => {
      toast({
        title: "回填失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const aiTemplateMutation = useMutation({
    mutationFn: async () => generateAdminAiRuleTemplate(token, selectedRawId!),
    onSuccess: (data) => {
      setAiTemplateDraft(JSON.stringify(data.data.template, null, 2));
      toast({ title: "已生成规则模板（草稿）" });
    },
    onError: (error) => {
      toast({
        title: "生成失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const applyAiTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!rawDetailQuery.data?.data) throw new Error("Raw crawl detail is not loaded");
      const sourceId = rawDetailQuery.data.data.sourceId;
      const source = sources.find((s) => s.id === sourceId);
      if (!source) throw new Error(`Source not found: ${sourceId}`);

      let parsed: any;
      try {
        parsed = JSON.parse(aiTemplateDraft);
      } catch {
        throw new Error("Template JSON parse failed");
      }

      const extract = parsed?.extract;
      if (!extract || typeof extract !== "object") {
        throw new Error("Template JSON must contain { extract: ... }");
      }

      const nextConfig = {
        ...(source.config ?? {}),
        extract: {
          ...(((source.config ?? {}) as any).extract ?? {}),
          ...extract,
        },
      };

      await updateAdminSource(token, sourceId, { config: nextConfig });
      await queryClient.invalidateQueries({ queryKey: ["admin", "sources"] });
      return { sourceId };
    },
    onSuccess: () => {
      toast({ title: "已写入 Source config.extract" });
    },
    onError: (error) => {
      toast({
        title: "写入失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const validateAiTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!rawDetailQuery.data?.data) throw new Error("Raw crawl detail is not loaded");
      const row = rawDetailQuery.data.data;
      // 1) Apply template into source config
      await applyAiTemplateMutation.mutateAsync();
      // 2) Find the marathon_source and trigger a single run
      const lookup = await lookupAdminMarathonSource(token, {
        marathonId: row.marathonId,
        sourceId: row.sourceId,
      });
      const msId = lookup.data.id;
      const run = await runAdminSyncMarathonSource(token, msId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "sync-runs"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "raw-crawl"] }),
      ]);
      return run.data;
    },
    onSuccess: () => {
      toast({ title: "已触发单条同步验证" });
    },
    onError: (error) => {
      toast({
        title: "验证失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const sources = sourcesQuery.data?.data ?? [];
  const sourceOptions = useMemo(() => sources.map((s) => ({ id: s.id, name: s.name })), [sources]);
  const stats = statsQuery.data?.data;

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

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap justify-start gap-2">
            <TabsTrigger value="overview">概览</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="runs">同步</TabsTrigger>
            <TabsTrigger value="binding">绑定/发现</TabsTrigger>
            <TabsTrigger value="review">needs_review</TabsTrigger>
            <TabsTrigger value="scheduler">定期更新</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>概览</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => statsQuery.refetch()}
                  disabled={!hasToken || statsQuery.isFetching}
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  刷新
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {!hasToken ? (
                  <div className="text-sm text-muted-foreground">
                    请先在上方输入并保存 `ADMIN_API_TOKEN`。
                  </div>
                ) : (
                  <>
                    {statsQuery.error ? (
                      <p className="text-sm text-destructive">
                        {getFriendlyErrorMessage(statsQuery.error)}
                      </p>
                    ) : null}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="rounded-xl border p-3">
                        <div className="text-xs text-muted-foreground">Sources</div>
                        <div className="text-lg font-bold mt-1">
                          {stats?.sources.active ?? "-"} / {stats?.sources.total ?? "-"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">active / total</div>
                      </div>
                      <div className="rounded-xl border p-3">
                        <div className="text-xs text-muted-foreground">Marathon Sources</div>
                        <div className="text-lg font-bold mt-1">
                          {stats?.marathonSources.total ?? "-"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">绑定总数</div>
                      </div>
                      <div className="rounded-xl border p-3">
                        <div className="text-xs text-muted-foreground">一次性触发</div>
                        <div className="mt-2">
                          <Button
                            size="sm"
                            onClick={() => runAllMutation.mutate()}
                            disabled={runAllMutation.isPending}
                          >
                            立即同步一次
                          </Button>
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          这是“单次触发”。定期更新见 “定期更新” Tab。
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border p-3 space-y-2">
                      <div className="text-sm font-medium">Raw Crawl 状态</div>
                      <div className="flex flex-wrap gap-2">
                        {(stats?.raw.byStatus ?? []).map((x) => (
                          <Badge
                            key={x.status}
                            variant={x.status === "needs_review" ? "destructive" : "secondary"}
                          >
                            {x.status}: {x.count}
                          </Badge>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        近 24h：{stats?.since24h ? formatDateTime(stats.since24h) : "-"} 至{" "}
                        {stats?.now ? formatDateTime(stats.now) : "-"}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(stats?.raw.last24hByStatus ?? []).map((x) => (
                          <Badge key={x.status} variant="outline">
                            {x.status}: {x.count}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border p-3 space-y-2">
                      <div className="text-sm font-medium">Sync Runs（近 24h）</div>
                      <div className="flex flex-wrap gap-2">
                        {(stats?.runs.last24hByStatus ?? []).map((x) => (
                          <Badge key={x.status} variant="outline">
                            {x.status}: {x.count}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sources" className="mt-4 space-y-6">
            <Card>
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
          </TabsContent>

          <TabsContent value="runs" className="mt-4 space-y-6">
            <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <CardHeader>
                <CardTitle>💡 同步记录说明</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">什么是同步运行？</span>
                  同步运行是系统从各个数据源抓取赛事信息并更新数据库的过程。每次同步会遍历所有已绑定的赛事URL，获取最新数据。
                </div>
                <div>
                  <span className="font-medium">运行状态说明：</span>
                </div>
                <ul className="list-disc list-inside space-y-1 pl-2">
                  <li><strong>running</strong>：正在执行同步任务</li>
                  <li><strong>completed</strong>：同步成功完成</li>
                  <li><strong>failed</strong>：同步过程中出现错误</li>
                  <li><strong>partial</strong>：部分数据源同步失败</li>
                </ul>
                <div>
                  <span className="font-medium">何时手动触发同步？</span>
                </div>
                <ul className="list-disc list-inside space-y-1 pl-2">
                  <li>新增赛事绑定后，想立即获取数据</li>
                  <li>发现数据过期，需要强制更新</li>
                  <li>测试数据源配置是否正确</li>
                  <li>开发环境下验证爬虫规则</li>
                </ul>
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  <span className="font-medium">提示：</span>生产环境下，自动更新调度器会定期执行同步，通常无需手动触发。
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>同步运行历史</CardTitle>
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
                  最近 40 次同步记录（自动每 10s 刷新）
                </div>
                {runsQuery.error ? (
                  <p className="text-sm text-destructive">
                    {getFriendlyErrorMessage(runsQuery.error)}
                  </p>
                ) : null}
                <div className="space-y-2">
                  {(runsQuery.data?.data ?? []).map((run) => (
                    <div key={run.id} className="rounded-xl border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium truncate">{run.status}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(run.startedAt)}
                        </div>
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
          </TabsContent>

          <TabsContent value="binding" className="mt-4 space-y-6">
            <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <CardHeader>
                <CardTitle>💡 赛事绑定说明</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">什么是赛事绑定？</span>
                  赛事绑定是将具体的数据源URL与系统中的赛事关联起来，建立后系统会定期从该URL抓取最新的赛事信息。
                </div>
                <div>
                  <span className="font-medium">操作步骤：</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 pl-2">
                  <li>使用"方法1"或"方法2"发现候选的赛事链接</li>
                  <li>点击"作为绑定 URL"按钮，将链接填充到绑定表单</li>
                  <li>在"创建赛事绑定"卡片中搜索并选择对应的赛事</li>
                  <li>选择数据源和是否设为主数据源</li>
                  <li>点击"绑定"完成关联</li>
                </ol>
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  <span className="font-medium">提示：</span>Primary（主数据源）的数据优先级更高，当多个数据源信息冲突时，会优先采用主数据源的信息。每个赛事通常只设置一个主数据源。
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>方法1：从列表页批量发现赛事</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  从赛事列表页批量发现详情页链接。适合从报名平台（如最酷、马拉马拉）批量导入赛事。
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">选择平台 Source</div>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={listDiscoverySourceId}
                      onChange={(e) => setListDiscoverySourceId(e.target.value)}
                    >
                      <option value="">请选择</option>
                      {sourceOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">列表页 URL</div>
                    <Input
                      placeholder="https://..."
                      value={listDiscoveryUrl}
                      onChange={(e) => setListDiscoveryUrl(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => listDiscoveryMutation.mutate()}
                    disabled={
                      !hasToken ||
                      listDiscoveryMutation.isPending ||
                      !listDiscoverySourceId.trim() ||
                      !listDiscoveryUrl.trim()
                    }
                  >
                    发现链接
                  </Button>
                  {listDiscoveryMutation.data?.data ? (
                    <Badge variant="secondary">count: {listDiscoveryMutation.data.data.count}</Badge>
                  ) : null}
                </div>

                {listDiscoveryMutation.data?.data?.results?.length ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {listDiscoveryMutation.data.data.results.map((r) => (
                      <div key={r.url} className="rounded-xl border p-3">
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium underline underline-offset-2"
                        >
                          {r.title ?? r.url}
                        </a>
                        <div className="text-xs text-muted-foreground mt-1 break-all">{r.url}</div>
                        <div className="mt-2">
                          <Button size="sm" variant="outline" onClick={() => setBindUrl(r.url)}>
                            作为绑定 URL
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>已绑定的赛事列表</CardTitle>
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
          <CardHeader>
            <CardTitle>方法2：搜索引擎发现赛事</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  使用搜索引擎查找赛事。适合发现新赛事或查找特定赛事的官网链接。
                </div>
            <div className="flex flex-col md:flex-row gap-2">
              <Input
                placeholder="Search query (admin-only)"
                value={discoveryQ}
                onChange={(e) => setDiscoveryQ(e.target.value)}
              />
              <Button
                variant="outline"
                onClick={() => discoveryMutation.mutate()}
                disabled={!hasToken || discoveryMutation.isPending || !discoveryQ.trim()}
              >
                Search
              </Button>
            </div>

            {discoveryMutation.data?.data?.length ? (
              <div className="space-y-2">
                {discoveryMutation.data.data.map((r) => (
                  <div key={r.url} className="rounded-xl border p-3">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium underline underline-offset-2"
                    >
                      {r.title}
                    </a>
                    {r.description ? (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {r.description}
                      </div>
                    ) : null}
                    <div className="text-xs text-muted-foreground mt-1 break-all">{r.url}</div>
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setBindUrl(r.url)}
                        disabled={!hasToken}
                      >
                        作为绑定 URL
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : discoveryMutation.isSuccess ? (
              <p className="text-sm text-muted-foreground">No results</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>创建赛事绑定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-xs text-muted-foreground">
              使用上面发现的链接，将赛事URL与系统中的赛事关联，建立后系统会自动定期抓取该链接的最新信息。
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input
                placeholder="搜索并选择赛事"
                value={bindMarathonSearch}
                onChange={(e) => setBindMarathonSearch(e.target.value)}
              />
              <Input
                placeholder="已选择的赛事ID"
                value={bindMarathonId}
                onChange={(e) => setBindMarathonId(e.target.value)}
              />
            </div>

            {marathonsQuery.data?.data?.length ? (
              <div className="rounded-xl border p-2 max-h-56 overflow-y-auto space-y-1">
                {marathonsQuery.data.data.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="w-full text-left text-sm px-2 py-1 rounded-lg hover:bg-muted"
                    onClick={() => {
                      setBindMarathonId(m.id);
                      toast({ title: `已选择：${m.name}` });
                    }}
                  >
                    <div className="font-medium truncate">{m.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{m.canonicalName}</div>
                  </button>
                ))}
              </div>
            ) : bindMarathonSearch.trim() ? (
              <div className="text-sm text-muted-foreground">无匹配赛事</div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">选择数据源平台</div>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={bindSourceId}
                  onChange={(e) => setBindSourceId(e.target.value)}
                >
                  <option value="">请选择</option>
                  {sourceOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">赛事详情页URL</div>
                <Input
                  placeholder="https://..."
                  value={bindUrl}
                  onChange={(e) => setBindUrl(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={bindPrimary ? "default" : "outline"}
                onClick={() => setBindPrimary((v) => !v)}
              >
                {bindPrimary ? "Primary" : "Secondary"}
              </Button>
              <Button
                size="sm"
                onClick={() => bindMutation.mutate()}
                disabled={
                  !hasToken ||
                  bindMutation.isPending ||
                  !bindMarathonId.trim() ||
                  !bindSourceId.trim() ||
                  !bindUrl.trim()
                }
              >
                绑定
              </Button>
            </div>
          </CardContent>
        </Card>

          </TabsContent>

          <TabsContent value="review" className="mt-4 space-y-6">
        <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle>💡 数据审核说明</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <strong>什么是 needs_review？</strong>
              <p className="text-muted-foreground mt-1">
                系统自动抓取到的数据需要人工确认才能发布到前台。这些数据可能包含不完整或需要验证的信息。
              </p>
            </div>
            <div>
              <strong>审核步骤：</strong>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground mt-1">
                <li>点击「审核并填写」按钮查看详细信息</li>
                <li>重点确认：比赛日期、报名状态、报名网址是否准确</li>
                <li>补充缺失的必填信息（如年份或完整日期）</li>
                <li>确认无误后点击「保存并发布」</li>
                <li>如果数据有问题或不需要，可以点击「忽略」</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>待审核的数据</CardTitle>
            <Button variant="outline" size="sm" onClick={() => rawQuery.refetch()} disabled={!hasToken}>
              刷新
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-col md:flex-row gap-2">
              <Input
                placeholder="status 过滤（例如 needs_review/processed/pending/ignored）"
                value={rawStatus}
                onChange={(e) => setRawStatus(e.target.value)}
                className="md:w-96"
              />
              <div className="text-xs text-muted-foreground flex items-center">
                默认查看 needs_review
              </div>
            </div>

            {(rawQuery.data?.data ?? []).map((row) => {
              const method = (row.metadata as any)?.extraction?.method;
              return (
                <div key={row.id} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant={row.status === "needs_review" ? "destructive" : "secondary"}>
                        {row.status}
                      </Badge>
                      {method ? <Badge variant="outline">{String(method)}</Badge> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      fetched={formatDateTime(row.fetchedAt)}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 break-all">{row.sourceUrl}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    http={row.httpStatus ?? "-"} / hash={(row.contentHash ?? "").slice(0, 10)} / processed=
                    {formatDateTime(row.processedAt)}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedRawId(row.id);
                        setResolveYear("");
                        setResolveRaceDate("");
                        setResolveStatus("");
                        setResolveRegUrl("");
                        setResolveNote("");
                        setResolvePublish(true);
                      }}
                      disabled={!hasToken}
                    >
                      审核并填写
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => ignoreRawMutation.mutate(row.id)}
                      disabled={!hasToken || ignoreRawMutation.isPending}
                    >
                      忽略
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

          </TabsContent>

          <TabsContent value="scheduler" className="mt-4 space-y-6">
<Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <CardHeader>
                <CardTitle>💡 自动更新说明</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">什么是自动更新？</span>
                  自动更新是一个后台调度任务，会按照设定的时间间隔，自动执行同步操作，保持赛事数据的时效性。无需人工干预，系统会持续跟踪所有已绑定数据源的最新信息。
                </div>
                <div>
                  <span className="font-medium">启用条件：</span>
                </div>
                <ul className="list-disc list-inside space-y-1 pl-2">
                  <li><strong>生产环境</strong>：当 <code>NODE_ENV=production</code> 时，自动更新默认开启</li>
                  <li><strong>开发环境</strong>：默认关闭，可通过环境变量 <code>SYNC_SCHEDULER_ENABLED=true</code> 强制开启</li>
                </ul>
                <div>
                  <span className="font-medium">最佳实践：</span>
                </div>
                <ul className="list-disc list-inside space-y-1 pl-2">
                  <li>开发环境下，先在"同步"标签页手动触发，验证数据源配置正确</li>
                  <li>确认爬虫规则工作正常后，再开启自动更新</li>
                  <li>生产环境推荐保持自动更新开启状态</li>
                  <li>可通过调整 <code>SYNC_SCHEDULER_INTERVAL_MS</code> 控制更新频率（单位：毫秒）</li>
                </ul>
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  <span className="font-medium">提示：</span>自动更新由服务端进程内的调度器执行，无需额外的定时任务或 cron 配置。
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>配置方法</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <div>
                  <span className="font-medium">步骤 1：设置环境变量</span>
                </div>
                <div className="ml-4 space-y-1">
                  <div>• <code>SYNC_SCHEDULER_ENABLED=true</code> - 强制启用自动更新（生产环境默认启用）</div>
                  <div>• <code>SYNC_SCHEDULER_INTERVAL_MS=3600000</code> - 设置更新间隔（示例：1小时）</div>
                </div>
                <div className="mt-3">
                  <span className="font-medium">步骤 2：重启服务</span>
                </div>
                <div className="ml-4">
                  修改环境变量后，需要重启服务器进程以使配置生效。
                </div>
                <div className="mt-3">
                  <span className="font-medium">步骤 3：验证运行</span>
                </div>
                <div className="ml-4">
                  前往"同步"标签页查看同步记录，确认调度器正常运行。
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog
          open={Boolean(selectedRawId)}
          onOpenChange={(open) => {
            if (!open) setSelectedRawId(null);
          }}
        >
          <DialogContent className="sm:max-w-[780px] gap-0 p-0 overflow-hidden rounded-[1.5rem] border-0 max-h-[90vh] overflow-y-auto">
            <DialogClose className="absolute right-4 top-4 z-20 rounded-full bg-background/50 p-2 text-muted-foreground hover:text-foreground backdrop-blur-sm transition-colors active:scale-95">
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </DialogClose>
            <div className="p-6 space-y-4">
              <DialogTitle className="text-lg font-bold">审核赛事数据</DialogTitle>

              {rawDetailQuery.isFetching ? (
                <div className="text-sm text-muted-foreground">加载中...</div>
              ) : rawDetailQuery.error ? (
                <div className="text-sm text-destructive">
                  {getFriendlyErrorMessage(rawDetailQuery.error)}
                </div>
              ) : rawDetailQuery.data?.data ? (
                <>
                  <div className="text-xs text-muted-foreground break-all">
                    {rawDetailQuery.data.data.sourceUrl}
                  </div>

                  <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                    <strong className="text-foreground">审核提示：</strong>请仔细核对以下信息，特别是比赛日期、报名状态和报名网址。如果信息准确无误，填写必要字段后即可保存并发布。
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input
                      placeholder="赛事年份（如果没有完整日期则必填，例如：2026）"
                      value={resolveYear}
                      onChange={(e) => setResolveYear(e.target.value)}
                    />
                    <Input
                      placeholder="比赛日期（格式：YYYY-MM-DD，例如：2026-04-15）"
                      value={resolveRaceDate}
                      onChange={(e) => setResolveRaceDate(e.target.value)}
                    />
                    <Input
                      placeholder="报名状态（例如：报名中、未开始、已截止）"
                      value={resolveStatus}
                      onChange={(e) => setResolveStatus(e.target.value)}
                    />
                    <Input
                      placeholder="报名网址（完整网址，例如：https://...）"
                      value={resolveRegUrl}
                      onChange={(e) => setResolveRegUrl(e.target.value)}
                    />
                  </div>

                  <Textarea
                    placeholder="备注（可选）"
                    value={resolveNote}
                    onChange={(e) => setResolveNote(e.target.value)}
                    rows={2}
                  />

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={resolvePublish ? "default" : "outline"}
                      onClick={() => setResolvePublish((v) => !v)}
                      type="button"
                    >
                      {resolvePublish ? "发布到前台：是" : "发布到前台：否"}
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      关闭后会只保存数据但保持草稿状态（前台不可见）。
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => resolveRawMutation.mutate(selectedRawId!)}
                      disabled={!hasToken || resolveRawMutation.isPending}
                    >
                      保存并发布
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => ignoreRawMutation.mutate(selectedRawId!)}
                      disabled={!hasToken || ignoreRawMutation.isPending}
                    >
                      忽略
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">metadata（只读）</div>
                    <Textarea
                      value={JSON.stringify(rawDetailQuery.data.data.metadata ?? {}, null, 2)}
                      readOnly
                      rows={8}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">AI 规则模板生成器（sources.config.extract）</div>
                    <div className="text-xs text-muted-foreground">
                      需要在服务器 `.env` 设置 `AI_API_KEY`/`AI_MODEL` 且 `AI_ENABLE_RULE_GEN=true`。
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() => aiTemplateMutation.mutate()}
                        disabled={!hasToken || aiTemplateMutation.isPending || !selectedRawId}
                      >
                        生成模板
                      </Button>
                      {aiTemplateMutation.data?.data?.model ? (
                        <Badge variant="secondary">model: {aiTemplateMutation.data.data.model}</Badge>
                      ) : null}
                    </div>

                    {aiTemplateMutation.data?.data ? (
                      <div className="rounded-xl border p-3 space-y-2">
                        <div className="text-xs text-muted-foreground">preview（应用模板到 rawContent）</div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">
                            raceDateRaw: {aiTemplateMutation.data.data.preview.raceDateRaw ?? "-"}
                          </Badge>
                          <Badge variant="outline">
                            raceDateNormalized:{" "}
                            {aiTemplateMutation.data.data.preview.raceDateNormalized ?? "-"}
                          </Badge>
                          <Badge variant="outline">
                            registrationStatus:{" "}
                            {aiTemplateMutation.data.data.preview.registrationStatusRaw ?? "-"}
                          </Badge>
                        </div>
                      </div>
                    ) : null}

                    {aiTemplateDraft.trim() ? (
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">
                          模板 JSON（可编辑；会把 `extract` 合并写入 Source config.extract）
                        </div>
                        <Textarea
                          value={aiTemplateDraft}
                          onChange={(e) => setAiTemplateDraft(e.target.value)}
                          rows={10}
                          className="font-mono text-xs"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() => applyAiTemplateMutation.mutate()}
                            disabled={!hasToken || applyAiTemplateMutation.isPending}
                          >
                            写入到 Source config
                          </Button>
                          <Button
                            size="sm"
                            type="button"
                            onClick={() => validateAiTemplateMutation.mutate()}
                            disabled={!hasToken || validateAiTemplateMutation.isPending}
                          >
                            保存并验证（单条同步）
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      rawContent（{rawDetailQuery.data.data.rawContentTruncated ? "已截断" : "摘要"}）
                    </div>
                    <Textarea
                      value={rawDetailQuery.data.data.rawContent ?? ""}
                      readOnly
                      rows={10}
                      className="font-mono text-xs"
                    />
                  </div>
                </>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
