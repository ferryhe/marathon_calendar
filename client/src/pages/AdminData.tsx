import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { RefreshCw, Shield, Terminal, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminDiscoveryWebSearch,
  adminDiscoveryList,
  createAdminMarathon,
  deleteAdminSource,
  generateAdminAiRuleTemplate,
  getAdminToken,
  getAdminStats,
  getAdminRawCrawl,
  ignoreAdminRawCrawl,
  listAdminMarathons,
  getAdminMarathonEdition,
  listAdminMarathonSources,
  listAdminRawCrawlFiltered,
  listAdminSources,
  lookupAdminMarathonSource,
  listAdminSyncRuns,
  resolveAdminRawCrawl,
  runAdminSyncAll,
  runAdminSyncMarathonSource,
  setAdminMarathonSourceAutoUpdate,
  setAdminToken,
  updateAdminMarathonEdition,
  updateAdminMarathonSource,
  deleteAdminMarathonSource,
  upsertAdminMarathonSource,
  updateAdminMarathon,
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
import { isChinaCountry } from "@shared/utils";

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

const REGISTRATION_STATUS_OPTIONS = [
  { value: "报名中", label: "报名中（open）" },
  { value: "即将开始", label: "即将开始（upcoming）" },
  { value: "已截止", label: "已截止（closed）" },
] as const;

function normalizeRegistrationStatus(input?: string | null): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";

  // Keep existing canonical Chinese values.
  if (REGISTRATION_STATUS_OPTIONS.some((x) => x.value === raw)) {
    return raw;
  }

  // Map common English/raw variants into canonical values.
  const normalized = raw.toLowerCase().replace(/[_\s-]+/g, "");
  if (["open", "registering", "registrationopen"].includes(normalized)) return "报名中";
  if (["upcoming", "notopen", "comingsoon", "notyetopen"].includes(normalized)) return "即将开始";
  if (["closed", "close", "deadlinepassed", "soldout", "ended"].includes(normalized)) return "已截止";

  return "";
}

function formatRawStatusLabel(status: string): string {
  switch (status) {
    case "needs_review":
      return "待审核";
    case "processed":
      return "已处理";
    case "pending":
      return "待处理";
    case "ignored":
      return "已忽略";
    case "failed":
      return "失败";
    default:
      return status;
  }
}


const RAW_STATUS_FILTER_OPTIONS = [
  { value: "needs_review", label: "待审核" },
  { value: "processed", label: "已处理" },
  { value: "pending", label: "待处理" },
  { value: "ignored", label: "已忽略" },
  { value: "failed", label: "失败" },
] as const;

export default function AdminDataPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [search, setSearch] = useState("");
  const [discoveryQ, setDiscoveryQ] = useState("");
  const [configDraftById, setConfigDraftById] = useState<Record<string, string>>({});
  const [rawStatus, setRawStatus] = useState<string>("needs_review");
  const [selectedRawId, setSelectedRawId] = useState<string | null>(null);

  const [bindMarathonSearch, setBindMarathonSearch] = useState("");
  const [bindMarathonId, setBindMarathonId] = useState("");
  const [bindSourceId, setBindSourceId] = useState("");
  const [bindUrl, setBindUrl] = useState("");
  const bindMarathonSearchInputRef = useRef<HTMLInputElement | null>(null);
  const bindUrlInputRef = useRef<HTMLInputElement | null>(null);
  const [bindPrimary, setBindPrimary] = useState(false);
  const [editingMarathonSourceId, setEditingMarathonSourceId] = useState<string | null>(null);
  const [editingMarathonSourceUrl, setEditingMarathonSourceUrl] = useState("");
  const [editingMarathonSourcePrimary, setEditingMarathonSourcePrimary] = useState(false);

  const [manageMarathonSearch, setManageMarathonSearch] = useState("");
  const [manageMarathonId, setManageMarathonId] = useState("");
  const [manageMarathonName, setManageMarathonName] = useState("");
  const [manageMarathonCanonicalName, setManageMarathonCanonicalName] = useState("");
  const [manageMarathonRegion, setManageMarathonRegion] = useState<"China" | "Overseas">("China");
  const [manageMarathonCity, setManageMarathonCity] = useState("");
  const [manageMarathonCountry, setManageMarathonCountry] = useState("");
  const [manageMarathonWebsiteUrl, setManageMarathonWebsiteUrl] = useState("");
  const [manageMarathonDescription, setManageMarathonDescription] = useState("");
  const [manageEditionYear, setManageEditionYear] = useState("");
  const [manageEditionRaceDate, setManageEditionRaceDate] = useState("");
  const [manageEditionStatus, setManageEditionStatus] = useState("");
  const [manageEditionRegUrl, setManageEditionRegUrl] = useState("");
  const [manageEditionPublish, setManageEditionPublish] = useState(true);
  const [manageCanonicalUnlocked, setManageCanonicalUnlocked] = useState(false);
  const [manageMarathonSnapshot, setManageMarathonSnapshot] = useState<{
    id: string;
    name: string;
    canonicalName: string;
    region: "China" | "Overseas";
    city: string;
    country: string;
    description: string;
    websiteUrl: string;
  } | null>(null);

  const [listDiscoverySourceId, setListDiscoverySourceId] = useState("");
  const [listDiscoveryUrl, setListDiscoveryUrl] = useState("");

  const [resolveYear, setResolveYear] = useState("");
  const [resolveRaceDate, setResolveRaceDate] = useState("");
  const [resolveStatus, setResolveStatus] = useState("");
  const [resolveRegUrl, setResolveRegUrl] = useState("");
  const [resolveName, setResolveName] = useState("");
  const [resolveCanonicalName, setResolveCanonicalName] = useState("");
  const [resolveRegion, setResolveRegion] = useState<"China" | "Overseas">("China");
  const [resolveCity, setResolveCity] = useState("");
  const [resolveCountry, setResolveCountry] = useState("");
  const [resolveWebsiteUrl, setResolveWebsiteUrl] = useState("");
  const [resolveDescription, setResolveDescription] = useState("");
  const [resolveCanonicalUnlocked, setResolveCanonicalUnlocked] = useState(false);
  const [resolveNote, setResolveNote] = useState("");
  const [resolvePublish, setResolvePublish] = useState(true);
  const [aiTemplateDraft, setAiTemplateDraft] = useState<string>("");

  const isThirdPartySourceType = (sourceType?: string | null) =>
    Boolean(sourceType && sourceType !== "official");

  const stripYearFromMarathonName = (value: string) =>
    value
      .replace(/(^|\s)[12]\d{3}(?=\s|$)/g, " ")
      .replace(/[（(]\s*[12]\d{3}\s*[)）]/g, " ")
      .replace(/\b\d{4}\s*(?:年|edition|赛季)\b/gi, " ")
      .replace(/第\s*\d+\s*届/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const normalizeMarathonNameForCompare = (value: string) =>
    stripYearFromMarathonName(value).toLowerCase().replace(/\s+/g, "");

  const isNoisyDiscoveryTitle = (value: string) => {
    const t = value.trim();
    if (!t) return true;
    const compact = t.replace(/\s+/g, "");
    return ["点此报名", "立即报名", "马上报名", "即将报名", "报名中", "去报名"].includes(compact);
  };

  const applyDiscoveredUrlToBinding = (params: {
    url: string;
    sourceId?: string;
    title?: string | null;
  }) => {
    setBindUrl(params.url);
    if (params.sourceId) {
      setBindSourceId(params.sourceId);
      const selectedSource = sources.find((s) => s.id === params.sourceId);
      if (isThirdPartySourceType(selectedSource?.type)) {
        setBindPrimary(false);
      }
    }

    const normalizedTitle = (params.title ?? "").replace(/\s+/g, " ").trim();
    const cleanedTitle = stripYearFromMarathonName(normalizedTitle);
    const canPrefillName = cleanedTitle.length > 0 && !isNoisyDiscoveryTitle(cleanedTitle);
    if (canPrefillName) {
      setBindMarathonSearch(cleanedTitle);
      setBindMarathonId("");
    }

    setTimeout(() => {
      const targetInput = canPrefillName ? bindMarathonSearchInputRef.current : bindUrlInputRef.current;
      targetInput?.scrollIntoView({ behavior: "smooth", block: "center" });
      targetInput?.focus();
    }, 0);

    toast({
      title: "已填充绑定表单",
      description: canPrefillName
        ? "已填充 URL 和赛事名，请确认自动匹配结果后点击绑定"
        : "已填充 URL，请继续搜索并选择赛事",
    });
  };

  const applyMarathonBaseToForm = (marathon: {
    id: string;
    name: string;
    canonicalName: string;
    city: string | null;
    country: string | null;
    description?: string | null;
    websiteUrl: string | null;
  }) => {
    const region: "China" | "Overseas" = isChinaCountry(marathon.country) ? "China" : "Overseas";
    setManageMarathonId(marathon.id);
    setManageMarathonName(marathon.name);
    setManageMarathonCanonicalName(marathon.canonicalName);
    setManageMarathonRegion(region);
    setManageMarathonCity(marathon.city ?? "");
    setManageMarathonCountry(region === "China" ? "" : marathon.country ?? "");
    setManageMarathonWebsiteUrl(marathon.websiteUrl ?? "");
    setManageMarathonDescription(marathon.description ?? "");
    setManageCanonicalUnlocked(false);
    setManageMarathonSnapshot({
      id: marathon.id,
      name: marathon.name,
      canonicalName: marathon.canonicalName,
      region,
      city: marathon.city ?? "",
      country: region === "China" ? "" : marathon.country ?? "",
      description: marathon.description ?? "",
      websiteUrl: marathon.websiteUrl ?? "",
    });
  };

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

    const marathon = row.marathon;
    if (marathon) {
      const region: "China" | "Overseas" = isChinaCountry(marathon.country) ? "China" : "Overseas";
      setResolveName(marathon.name ?? "");
      setResolveCanonicalName(marathon.canonicalName ?? "");
      setResolveRegion(region);
      setResolveCity(marathon.city ?? "");
      setResolveCountry(region === "China" ? "" : marathon.country ?? "");
      setResolveWebsiteUrl(marathon.websiteUrl ?? "");
      setResolveDescription(marathon.description ?? "");
      setResolveCanonicalUnlocked(false);
    }

    const latestEdition = row.latestEdition;
    if (latestEdition) {
      setResolveYear(String(latestEdition.year ?? ""));
      setResolveRaceDate(latestEdition.raceDate ?? "");
      setResolveStatus(normalizeRegistrationStatus(latestEdition.registrationStatus ?? ""));
      setResolveRegUrl(latestEdition.registrationUrl ?? "");
      setResolvePublish((latestEdition.publishStatus ?? "published") === "published");
    }

    const meta = row.metadata as any;
    const ext = meta?.extraction;
    if (ext && typeof ext === "object") {
      if (typeof ext.raceDate === "string") {
        setResolveRaceDate(ext.raceDate);
      }
      setResolveStatus(
        normalizeRegistrationStatus(
          typeof ext.registrationStatus === "string" ? ext.registrationStatus : "",
        ),
      );
      if (typeof ext.registrationUrl === "string") {
        setResolveRegUrl(ext.registrationUrl);
      }
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

  const manageMarathonsQuery = useQuery({
    queryKey: ["admin", "marathons-manage", token, manageMarathonSearch],
    queryFn: () =>
      listAdminMarathons(token, {
        limit: 30,
        search: manageMarathonSearch.trim() ? manageMarathonSearch.trim() : undefined,
      }),
    enabled: hasToken && tab === "binding",
  });

  const manageMarathonSourcesQuery = useQuery({
    queryKey: ["admin", "marathon-sources", "by-marathon", token, manageMarathonId],
    queryFn: () =>
      listAdminMarathonSources(token, {
        limit: 100,
        marathonId: manageMarathonId,
      }),
    enabled: hasToken && tab === "binding" && Boolean(manageMarathonId),
  });

  const manageMarathonEditionQuery = useQuery({
    queryKey: ["admin", "marathon-edition", token, manageMarathonId],
    queryFn: () => getAdminMarathonEdition(token, manageMarathonId),
    enabled: hasToken && tab === "binding" && Boolean(manageMarathonId),
  });

  useEffect(() => {
    if (!hasToken || tab !== "binding") return;
    if (bindMarathonId.trim()) return;
    const rows = marathonsQuery.data?.data ?? [];
    if (rows.length !== 1) return;
    const only = rows[0];
    setBindMarathonId(only.id);
    toast({ title: `已自动匹配赛事：${only.name}` });
  }, [hasToken, tab, bindMarathonId, marathonsQuery.data, toast]);

  useEffect(() => {
    const edition = manageMarathonEditionQuery.data?.data.edition;
    const targetYear = manageMarathonEditionQuery.data?.data.targetYear;
    if (!manageMarathonId) return;
    setManageEditionYear(String(edition?.year ?? targetYear ?? new Date().getFullYear()));
    setManageEditionRaceDate(edition?.raceDate ?? "");
    setManageEditionStatus(
      normalizeRegistrationStatus(edition?.registrationStatus ?? ""),
    );
    setManageEditionRegUrl(edition?.registrationUrl ?? "");
    setManageEditionPublish((edition?.publishStatus ?? "published") === "published");
  }, [manageMarathonId, manageMarathonEditionQuery.data]);

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
        title: "搜索失败",
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
      toast({ title: "已更新数据源配置" });
    },
    onError: (error) => {
      toast({
        title: "更新失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteSourceMutation = useMutation({
    mutationFn: async (id: string) => deleteAdminSource(token, id, { force: true }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "sources"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "stats"] }),
      ]);
      toast({ title: "已删除数据源" });
    },
    onError: (error) => {
      toast({
        title: "删除失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const bindMutation = useMutation({
    mutationFn: async () => {
      const source = sources.find((s) => s.id === bindSourceId) ?? null;
      if (!source) throw new Error("请先选择数据源平台");
      const sourceIsThirdParty = isThirdPartySourceType(source.type);
      const url = bindUrl.trim();

      let marathonId = bindMarathonId.trim();
      let createdMarathonName: string | null = null;
      let reusedMarathonName: string | null = null;
      if (!marathonId) {
        const rawName = bindMarathonSearch.trim();
        const name = stripYearFromMarathonName(rawName) || rawName;
        if (!name) throw new Error("请先输入赛事名称或从发现结果中选择");

        const existingList = await listAdminMarathons(token, {
          limit: 30,
          search: name,
        });
        const normalizedIncoming = normalizeMarathonNameForCompare(name);
        const exactMatch = existingList.data.find(
          (m) => normalizeMarathonNameForCompare(m.name) === normalizedIncoming,
        );

        if (exactMatch) {
          marathonId = exactMatch.id;
          reusedMarathonName = exactMatch.name;
        } else {
          const created = await createAdminMarathon(token, {
            name,
            canonicalName: undefined,
            city: null,
            country: null,
            description: null,
            // Third-party source URL should not overwrite official website field.
            websiteUrl: sourceIsThirdParty ? null : url,
          });
          marathonId = created.data.id;
          createdMarathonName = created.data.name;
        }
      }

      if (!marathonId) {
        throw new Error("赛事创建或匹配失败，请重试");
      }

      await upsertAdminMarathonSource(token, {
        marathonId,
        sourceId: bindSourceId,
        sourceUrl: url,
        // Third-party platform links must stay secondary.
        isPrimary: sourceIsThirdParty ? false : bindPrimary,
      });

      return {
        marathonId,
        createdMarathonName,
        reusedMarathonName,
        sourceIsThirdParty,
      };
    },
    onSuccess: async (result) => {
      setBindMarathonId(result.marathonId);
      if (result.reusedMarathonName) {
        setBindMarathonSearch(result.reusedMarathonName);
      }
      const title = result.createdMarathonName
        ? `已自动创建赛事并绑定：${result.createdMarathonName}`
        : result.reusedMarathonName
          ? `已复用赛事并绑定：${result.reusedMarathonName}`
          : "已绑定赛事来源";
      const description = result.sourceIsThirdParty
        ? "第三方来源已自动按“次要”保存"
        : undefined;
      toast({ title, ...(description ? { description } : {}) });
      await queryClient.invalidateQueries({ queryKey: ["admin", "marathon-sources"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "marathons"] });
    },
    onError: (error) => {
      toast({
        title: "绑定失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const updateMarathonMutation = useMutation({
    mutationFn: async () => {
      if (!manageMarathonId.trim()) throw new Error("请先选择赛事");
      const name = manageMarathonName.trim();
      const canonicalName = manageMarathonCanonicalName.trim();
      if (!name) throw new Error("赛事名称不能为空");
      if (!canonicalName) throw new Error("canonicalName 不能为空");
      if (
        manageMarathonSnapshot &&
        canonicalName !== manageMarathonSnapshot.canonicalName &&
        !manageCanonicalUnlocked
      ) {
        throw new Error("请先解锁 canonicalName 编辑，再进行修改");
      }

      const country =
        manageMarathonRegion === "China" ? "China" : manageMarathonCountry.trim();
      if (manageMarathonRegion === "Overseas" && !country) {
        throw new Error("海外赛事必须填写国家（例如：Japan、USA）");
      }
      if (manageMarathonRegion === "Overseas" && isChinaCountry(country)) {
        throw new Error("海外赛事国家不能是 China，请改为真实国家名");
      }

      return updateAdminMarathon(token, manageMarathonId, {
        name,
        canonicalName,
        city: manageMarathonCity.trim() ? manageMarathonCity.trim() : null,
        country,
        description: manageMarathonDescription.trim() ? manageMarathonDescription.trim() : null,
        websiteUrl: manageMarathonWebsiteUrl.trim() ? manageMarathonWebsiteUrl.trim() : null,
      });
    },
    onSuccess: async (result) => {
      applyMarathonBaseToForm(result.data);
      toast({ title: "已保存赛事基础信息" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "marathons"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "marathons-manage"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "marathon-sources"] }),
      ]);
    },
    onError: (error) => {
      toast({
        title: "保存失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const updateMarathonEditionMutation = useMutation({
    mutationFn: async () => {
      if (!manageMarathonId.trim()) throw new Error("请先选择赛事");
      const normalizedStatus = normalizeRegistrationStatus(manageEditionStatus);
      const year = manageEditionYear.trim() ? Number(manageEditionYear) : undefined;
      if (!manageEditionRaceDate.trim() && !year) {
        throw new Error("请填写比赛日期或年份");
      }
      return updateAdminMarathonEdition(token, manageMarathonId, {
        ...(year ? { year } : {}),
        ...(manageEditionRaceDate.trim() ? { raceDate: manageEditionRaceDate.trim() } : {}),
        ...(normalizedStatus ? { registrationStatus: normalizedStatus } : {}),
        ...(manageEditionRegUrl.trim() ? { registrationUrl: manageEditionRegUrl.trim() } : {}),
        publish: manageEditionPublish,
      });
    },
    onSuccess: async () => {
      toast({ title: "已保存届次信息" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "marathon-edition", token, manageMarathonId] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "raw-crawl"] }),
      ]);
    },
    onError: (error) => {
      toast({
        title: "保存届次失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const setMarathonSourceAutoUpdateMutation = useMutation({
    mutationFn: async (payload: { id: string; enabled: boolean }) =>
      setAdminMarathonSourceAutoUpdate(token, payload.id, payload.enabled),
    onSuccess: async () => {
      toast({ title: "已更新自动更新开关" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "marathon-sources"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "marathon-sources", "by-marathon"] }),
      ]);
    },
    onError: (error) => {
      toast({
        title: "更新自动更新开关失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const runMarathonSourceMutation = useMutation({
    mutationFn: async (marathonSourceId: string) => runAdminSyncMarathonSource(token, marathonSourceId),
    onSuccess: async () => {
      toast({ title: "已触发单条同步" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "sync-runs"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "raw-crawl"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "marathon-sources"] }),
      ]);
    },
    onError: (error) => {
      toast({
        title: "触发同步失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const runSelectedMarathonAllSourcesMutation = useMutation({
    mutationFn: async () => {
      const rows = manageMarathonSourcesQuery.data?.data ?? [];
      if (!rows.length) {
        throw new Error("当前赛事还没有绑定数据源");
      }
      await Promise.all(rows.map((item) => runAdminSyncMarathonSource(token, item.id)));
      return rows.length;
    },
    onSuccess: async (count) => {
      toast({ title: `已触发同步：${count} 条绑定` });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "sync-runs"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "raw-crawl"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "marathon-sources"] }),
      ]);
    },
    onError: (error) => {
      toast({
        title: "批量同步失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const updateMarathonSourceMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      sourceUrl?: string;
      isPrimary?: boolean;
    }) => updateAdminMarathonSource(token, payload.id, payload),
    onSuccess: async () => {
      setEditingMarathonSourceId(null);
      toast({ title: "已更新绑定" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "marathon-sources"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "marathon-sources", "by-marathon"] }),
      ]);
    },
    onError: (error) => {
      toast({
        title: "更新绑定失败",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteMarathonSourceMutation = useMutation({
    mutationFn: async (id: string) => deleteAdminMarathonSource(token, id),
    onSuccess: async () => {
      toast({ title: "已删除绑定" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "marathon-sources"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "marathon-sources", "by-marathon"] }),
      ]);
    },
    onError: (error) => {
      toast({
        title: "删除绑定失败",
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
    mutationFn: async (id: string) => {
      const normalizedStatus = normalizeRegistrationStatus(resolveStatus);
      const incomingCanonical = resolveCanonicalName.trim();
      const currentCanonical = rawDetailQuery.data?.data?.marathon?.canonicalName ?? "";
      if (
        incomingCanonical &&
        currentCanonical &&
        incomingCanonical !== currentCanonical &&
        !resolveCanonicalUnlocked
      ) {
        throw new Error("请先解锁 canonicalName 编辑，再进行修改");
      }

      const country = resolveRegion === "China" ? "China" : resolveCountry.trim();
      if (resolveRegion === "Overseas" && !country) {
        throw new Error("海外赛事必须填写国家（例如：Japan、USA）");
      }
      if (resolveRegion === "Overseas" && isChinaCountry(country)) {
        throw new Error("海外赛事国家不能是 China，请改为真实国家名");
      }

      return resolveAdminRawCrawl(token, id, {
        ...(resolveYear.trim() ? { year: Number(resolveYear) } : {}),
        ...(resolveRaceDate.trim() ? { raceDate: resolveRaceDate.trim() } : {}),
        ...(normalizedStatus ? { registrationStatus: normalizedStatus } : {}),
        ...(resolveRegUrl.trim() ? { registrationUrl: resolveRegUrl.trim() } : {}),
        ...(resolveName.trim() ? { name: resolveName.trim() } : {}),
        ...(incomingCanonical ? { canonicalName: incomingCanonical } : {}),
        ...(resolveCity.trim() ? { city: resolveCity.trim() } : { city: null }),
        ...(country ? { country } : { country: null }),
        ...(resolveDescription.trim() ? { description: resolveDescription.trim() } : { description: null }),
        ...(resolveWebsiteUrl.trim() ? { websiteUrl: resolveWebsiteUrl.trim() } : { websiteUrl: null }),
        note: resolveNote.trim() ? resolveNote.trim() : undefined,
        publish: resolvePublish,
      });
    },
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
      toast({ title: "已写入数据源提取规则（config.extract）" });
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

  useEffect(() => {
    if (!bindSourceId) return;
    const source = sources.find((s) => s.id === bindSourceId);
    if (!source) return;
    if (!isThirdPartySourceType(source.type)) return;
    if (!bindPrimary) return;
    setBindPrimary(false);
    toast({ title: "第三方来源已自动设置为“次要”" });
  }, [bindSourceId, bindPrimary, sources, toast]);

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
            <TabsTrigger value="sources">数据源</TabsTrigger>
            <TabsTrigger value="runs">同步</TabsTrigger>
            <TabsTrigger value="binding">绑定/发现</TabsTrigger>
            <TabsTrigger value="review">待审核</TabsTrigger>
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
                        <div className="text-xs text-muted-foreground">数据源平台</div>
                        <div className="text-lg font-bold mt-1">
                          {stats?.sources.active ?? "-"} / {stats?.sources.total ?? "-"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">启用 / 总数</div>
                      </div>
                      <div className="rounded-xl border p-3">
                        <div className="text-xs text-muted-foreground">赛事绑定</div>
                        <div className="text-lg font-bold mt-1">
                          {stats?.marathonSources.total ?? "-"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">已绑定的赛事数</div>
                      </div>
                      <div className="rounded-xl border p-3">
                        <div className="text-xs text-muted-foreground">手动同步</div>
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
                          单次触发所有绑定。定期更新见「自动更新」标签。
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border p-3 space-y-2">
                      <div className="text-sm font-medium">数据抓取状态</div>
                      <div className="text-xs text-muted-foreground mb-2">
                        needs_review = 需要人工审核确认的数据
                      </div>
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
                      <div className="text-sm font-medium">同步记录（近 24h）</div>
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
                <CardTitle>数据源</CardTitle>
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
                                disabled={updateSourceMutation.isPending || deleteSourceMutation.isPending}
                              >
                                {source.isActive ? "启用中" : "已停用"}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  const ok = window.confirm(
                                    `确认删除数据源「${source.name}」？\n将同时删除关联绑定与历史抓取/同步记录，此操作不可撤销。`,
                                  );
                                  if (!ok) return;
                                  deleteSourceMutation.mutate(source.id);
                                }}
                                disabled={updateSourceMutation.isPending || deleteSourceMutation.isPending}
                              >
                                删除
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
                              disabled={deleteSourceMutation.isPending}
                            />
                            <Input value={source.baseUrl ?? ""} disabled placeholder="基础 URL" />
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
                              disabled={updateSourceMutation.isPending || deleteSourceMutation.isPending}
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
                  <li>使用"方法1"、"方法2"或"方法3"准备候选的赛事链接</li>
                  <li>点击"作为绑定 URL"按钮，将链接填充到绑定表单</li>
                  <li>在"创建赛事绑定"卡片中搜索并选择对应的赛事</li>
                  <li>选择数据源和是否设为主数据源</li>
                  <li>点击"绑定"完成关联</li>
                </ol>
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  <span className="font-medium">提示：</span>主要数据源的优先级更高，当多个来源信息冲突时，会优先采用主要来源的信息。每个赛事通常只设置一个主要数据源。
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>赛事资料中心（统一编辑）</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    manageMarathonsQuery.refetch();
                    if (manageMarathonId) {
                      manageMarathonSourcesQuery.refetch();
                    }
                  }}
                  disabled={!hasToken}
                >
                  刷新
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  在这里统一处理单个赛事：先搜索并选择赛事，再维护基础信息（地点/国家/简介/官网），也可一键同步该赛事的所有已绑定来源。
                </div>
                <div className="text-xs text-muted-foreground">
                  同步主要用于抓取并提取届次字段（比赛日期/报名状态/报名链接）到待审核队列；赛事基础资料（名称、地点、国家、简介、官网）仍建议在本卡片人工维护。
                </div>

                <div className="flex flex-col md:flex-row gap-2">
                  <Input
                    placeholder="搜索赛事名称（可留空查看前 30 条）"
                    value={manageMarathonSearch}
                    onChange={(e) => setManageMarathonSearch(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    onClick={() => manageMarathonsQuery.refetch()}
                    disabled={!hasToken || manageMarathonsQuery.isFetching}
                  >
                    搜索
                  </Button>
                </div>

                {manageMarathonsQuery.error ? (
                  <p className="text-sm text-destructive">
                    {getFriendlyErrorMessage(manageMarathonsQuery.error)}
                  </p>
                ) : null}

                {manageMarathonsQuery.data?.data?.length ? (
                  <div className="rounded-xl border p-2 max-h-56 overflow-y-auto space-y-1">
                    {manageMarathonsQuery.data.data.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="w-full text-left text-sm px-2 py-1 rounded-lg hover:bg-muted"
                        onClick={() => {
                          applyMarathonBaseToForm(m);
                          setManageMarathonSearch(m.name);
                          toast({ title: `已选择赛事：${m.name}` });
                        }}
                      >
                        <div className="font-medium truncate">{m.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {m.canonicalName} / {m.city ?? "-"} / {m.country ?? "-"}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : manageMarathonsQuery.isSuccess ? (
                  <div className="text-sm text-muted-foreground">未找到赛事</div>
                ) : null}

                {manageMarathonId ? (
                  <div className="rounded-xl border p-3 space-y-3">
                    <div className="text-xs text-muted-foreground break-all">
                      当前赛事 ID：{manageMarathonId}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Input
                        placeholder="赛事名称（必填）"
                        value={manageMarathonName}
                        onChange={(e) => setManageMarathonName(e.target.value)}
                      />
                      <Input
                        placeholder="canonicalName（必填，建议小写+连字符，如 beijing-marathon）"
                        value={manageMarathonCanonicalName}
                        onChange={(e) => setManageMarathonCanonicalName(e.target.value)}
                        readOnly={!manageCanonicalUnlocked}
                      />
                      <Input
                        placeholder="地点/城市（可选）"
                        value={manageMarathonCity}
                        onChange={(e) => setManageMarathonCity(e.target.value)}
                      />
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={manageMarathonRegion}
                        onChange={(e) => {
                          const next = e.target.value as "China" | "Overseas";
                          setManageMarathonRegion(next);
                          if (next === "China") {
                            setManageMarathonCountry("");
                          }
                        }}
                      >
                        <option value="China">中国</option>
                        <option value="Overseas">非中国（海外）</option>
                      </select>
                      <Input
                        placeholder={
                          manageMarathonRegion === "China"
                            ? "国家/地区将自动保存为 China"
                            : "国家（必填，例如：Japan、USA、Germany）"
                        }
                        value={manageMarathonCountry}
                        onChange={(e) => setManageMarathonCountry(e.target.value)}
                        disabled={manageMarathonRegion === "China"}
                      />
                      <Input
                        placeholder="官网 URL（可选）"
                        value={manageMarathonWebsiteUrl}
                        onChange={(e) => setManageMarathonWebsiteUrl(e.target.value)}
                      />
                    </div>

                    <Textarea
                      placeholder="赛事简介（可选）"
                      value={manageMarathonDescription}
                      onChange={(e) => setManageMarathonDescription(e.target.value)}
                      rows={3}
                    />

                    <div className="rounded-lg border p-3 space-y-2">
                      <div className="text-sm font-medium">届次信息（详情页展示字段）</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <Input
                          placeholder="届次年份（如 2026）"
                          value={manageEditionYear}
                          onChange={(e) => setManageEditionYear(e.target.value)}
                        />
                        <Input
                          placeholder="比赛日期（YYYY-MM-DD）"
                          value={manageEditionRaceDate}
                          onChange={(e) => setManageEditionRaceDate(e.target.value)}
                        />
                        <select
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                          value={manageEditionStatus}
                          onChange={(e) => setManageEditionStatus(e.target.value)}
                        >
                          <option value="">报名状态（请选择）</option>
                          {REGISTRATION_STATUS_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                        <Input
                          placeholder="报名网址（完整 URL）"
                          value={manageEditionRegUrl}
                          onChange={(e) => setManageEditionRegUrl(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant={manageEditionPublish ? "default" : "outline"}
                          type="button"
                          onClick={() => setManageEditionPublish((v) => !v)}
                        >
                          {manageEditionPublish ? "发布状态：已发布" : "发布状态：草稿"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => updateMarathonEditionMutation.mutate()}
                          disabled={!hasToken || updateMarathonEditionMutation.isPending}
                        >
                          保存届次信息
                        </Button>
                        {manageMarathonEditionQuery.isFetching ? (
                          <span className="text-xs text-muted-foreground">加载中...</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      `canonicalName` 是系列赛事内部唯一标识（跨年份复用）。已有赛事一般不建议修改，避免影响去重与历史关联。
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={manageCanonicalUnlocked ? "default" : "outline"}
                        type="button"
                        onClick={() => setManageCanonicalUnlocked((v) => !v)}
                      >
                        {manageCanonicalUnlocked ? "已解锁 canonicalName 编辑" : "解锁 canonicalName 编辑"}
                      </Button>
                      <div className="text-xs text-muted-foreground">
                        新增赛事请规范填写；后续年份应绑定到同一 `canonicalName` 下的同一赛事主体。
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        onClick={() => updateMarathonMutation.mutate()}
                        disabled={!hasToken || updateMarathonMutation.isPending}
                      >
                        保存赛事基础信息
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => runSelectedMarathonAllSourcesMutation.mutate()}
                        disabled={
                          !hasToken ||
                          runSelectedMarathonAllSourcesMutation.isPending ||
                          !manageMarathonId
                        }
                      >
                        同步该赛事全部来源
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (!manageMarathonSnapshot) return;
                          setManageMarathonName(manageMarathonSnapshot.name);
                          setManageMarathonCanonicalName(manageMarathonSnapshot.canonicalName);
                          setManageMarathonRegion(manageMarathonSnapshot.region);
                          setManageMarathonCity(manageMarathonSnapshot.city);
                          setManageMarathonCountry(manageMarathonSnapshot.country);
                          setManageMarathonWebsiteUrl(manageMarathonSnapshot.websiteUrl);
                          setManageMarathonDescription(manageMarathonSnapshot.description);
                          setManageCanonicalUnlocked(false);
                          manageMarathonEditionQuery.refetch();
                        }}
                        disabled={!manageMarathonSnapshot}
                      >
                        重置为已加载值
                      </Button>
                    </div>

                    <div className="rounded-lg border p-2 space-y-2">
                      <div className="text-xs text-muted-foreground">
                        当前赛事已绑定来源（可直接单条同步）
                      </div>
                      {manageMarathonSourcesQuery.isFetching ? (
                        <div className="text-xs text-muted-foreground">加载中...</div>
                      ) : null}
                      {manageMarathonSourcesQuery.error ? (
                        <div className="text-xs text-destructive">
                          {getFriendlyErrorMessage(manageMarathonSourcesQuery.error)}
                        </div>
                      ) : null}
                      {(manageMarathonSourcesQuery.data?.data ?? []).length === 0 ? (
                        <div className="text-xs text-muted-foreground">该赛事暂无绑定来源</div>
                      ) : (
                        <div className="space-y-2">
                          {(manageMarathonSourcesQuery.data?.data ?? []).map((item) => (
                            <div key={item.id} className="rounded border p-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium truncate">{item.sourceName}</div>
                                  <div className="text-xs text-muted-foreground break-all">{item.sourceUrl}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant={item.isPrimary ? "default" : "secondary"}>
                                    {item.isPrimary ? "主要" : "次要"}
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant={item.autoUpdateEnabled === false ? "outline" : "default"}
                                    onClick={() =>
                                      setMarathonSourceAutoUpdateMutation.mutate({
                                        id: item.id,
                                        enabled: item.autoUpdateEnabled === false,
                                      })
                                    }
                                    disabled={
                                      !hasToken ||
                                      setMarathonSourceAutoUpdateMutation.isPending
                                    }
                                  >
                                    {item.autoUpdateEnabled === false ? "自动更新：关" : "自动更新：开"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setEditingMarathonSourceId(item.id);
                                      setEditingMarathonSourceUrl(item.sourceUrl);
                                      setEditingMarathonSourcePrimary(Boolean(item.isPrimary));
                                    }}
                                    disabled={
                                      updateMarathonSourceMutation.isPending ||
                                      deleteMarathonSourceMutation.isPending
                                    }
                                  >
                                    修改
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => runMarathonSourceMutation.mutate(item.id)}
                                    disabled={!hasToken || runMarathonSourceMutation.isPending}
                                  >
                                    单条同步
                                  </Button>
                                </div>
                              </div>
                              {editingMarathonSourceId === item.id ? (
                                <div className="mt-2 space-y-2 rounded-lg border p-2">
                                  <div className="text-xs text-muted-foreground">
                                    来源类型：{item.sourceType ?? "-"} / sourceId：{item.sourceId}
                                  </div>
                                  <Input
                                    value={editingMarathonSourceUrl}
                                    onChange={(e) => setEditingMarathonSourceUrl(e.target.value)}
                                    placeholder="https://..."
                                  />
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                      size="sm"
                                      variant={editingMarathonSourcePrimary ? "default" : "outline"}
                                      onClick={() => setEditingMarathonSourcePrimary((v) => !v)}
                                      disabled={
                                        item.sourceType !== "official" ||
                                        updateMarathonSourceMutation.isPending
                                      }
                                    >
                                      {editingMarathonSourcePrimary ? "主要" : "次要"}
                                    </Button>
                                    {item.sourceType !== "official" ? (
                                      <span className="text-xs text-muted-foreground">
                                        第三方来源固定为次要
                                      </span>
                                    ) : null}
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        updateMarathonSourceMutation.mutate({
                                          id: item.id,
                                          sourceUrl: editingMarathonSourceUrl.trim(),
                                          isPrimary: editingMarathonSourcePrimary,
                                        })
                                      }
                                      disabled={
                                        updateMarathonSourceMutation.isPending ||
                                        !editingMarathonSourceUrl.trim()
                                      }
                                    >
                                      保存修改
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => {
                                        const ok = window.confirm(
                                          `确认删除这条绑定？\n${item.marathonName} <- ${item.sourceName}`,
                                        );
                                        if (!ok) return;
                                        deleteMarathonSourceMutation.mutate(item.id);
                                      }}
                                      disabled={
                                        updateMarathonSourceMutation.isPending ||
                                        deleteMarathonSourceMutation.isPending
                                      }
                                    >
                                      删除绑定
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setEditingMarathonSourceId(null)}
                                      disabled={updateMarathonSourceMutation.isPending}
                                    >
                                      取消
                                    </Button>
                                  </div>
                                </div>
                              ) : null}
                              <div className="text-xs text-muted-foreground mt-1">
                                上次检查：{formatDateTime(item.lastCheckedAt)} / 下次检查：
                                {formatDateTime(item.nextCheckAt)} / HTTP={item.lastHttpStatus ?? "-"}
                              </div>
                              {item.lastError ? (
                                <div className="text-xs text-destructive mt-1 break-all">{item.lastError}</div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    先从上面的搜索结果里选择一个赛事，再进行基础信息编辑与单赛事同步。
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>创建赛事绑定</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  使用下面方法准备好链接后，在这里将赛事URL与系统中的赛事关联，建立后系统会自动定期抓取该链接的最新信息。
                </div>
                <div className="text-xs text-muted-foreground">
                  同一赛事跨年份会优先复用同一个赛事主体（自动去除年份匹配），再写入对应年份数据。
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Input
                    ref={bindMarathonSearchInputRef}
                    placeholder="搜索并选择赛事"
                    value={bindMarathonSearch}
                    onChange={(e) => {
                      setBindMarathonSearch(e.target.value);
                      setBindMarathonId("");
                    }}
                  />
                  <Input
                    placeholder="赛事ID（系统自动生成）"
                    value={bindMarathonId}
                    readOnly
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  赛事ID为系统唯一标识（UUID）。无需手工编写，选中赛事后会自动填充。
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
                          setBindMarathonSearch(m.name);
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
                      ref={bindUrlInputRef}
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
                    {bindPrimary ? "主要" : "次要"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => bindMutation.mutate()}
                    disabled={
                      !hasToken ||
                      bindMutation.isPending ||
                      (!bindMarathonId.trim() && !bindMarathonSearch.trim()) ||
                      !bindSourceId.trim() ||
                      !bindUrl.trim()
                    }
                  >
                    绑定
                  </Button>
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
                    <div className="text-xs text-muted-foreground">选择平台数据源</div>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={listDiscoverySourceId}
                      onChange={(e) => {
                        const nextSourceId = e.target.value;
                        setListDiscoverySourceId(nextSourceId);
                        const picked = sources.find((s) => s.id === nextSourceId);
                        setListDiscoveryUrl(picked?.baseUrl ?? "");
                      }}
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
                    <div className="text-xs text-muted-foreground">选择平台后会自动填充，可手动修改。</div>
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
                    <Badge variant="secondary">发现数量：{listDiscoveryMutation.data.data.count}</Badge>
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
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              applyDiscoveredUrlToBinding({
                                url: r.url,
                                sourceId: listDiscoverySourceId,
                                title: r.title,
                              })
                            }
                          >
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
                <CardTitle>方法2：搜索引擎发现赛事</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  使用搜索引擎查找赛事。适合发现新赛事或查找特定赛事的官网链接。
                </div>
                <div className="flex flex-col md:flex-row gap-2">
                  <Input
                    placeholder="搜索关键词（仅管理员）"
                    value={discoveryQ}
                    onChange={(e) => setDiscoveryQ(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    onClick={() => discoveryMutation.mutate()}
                    disabled={!hasToken || discoveryMutation.isPending || !discoveryQ.trim()}
                  >
                    搜索
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
                            onClick={() =>
                              applyDiscoveredUrlToBinding({
                                url: r.url,
                                title: r.title,
                              })
                            }
                            disabled={!hasToken}
                          >
                            作为绑定 URL
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : discoveryMutation.isSuccess ? (
                  <p className="text-sm text-muted-foreground">未找到结果</p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>方法3：手动录入赛事链接</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <div>如果方法1/2未找到合适链接，可直接在上方“创建赛事绑定”里手动粘贴赛事详情页 URL。</div>
                <div>建议填写详情页而不是列表页，并选择对应平台数据源，避免后续抓取规则失配。</div>
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
                  <Button
                    variant="outline"
                    onClick={() => marathonSourcesQuery.refetch()}
                    disabled={!hasToken}
                  >
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
                            <span className="text-xs text-muted-foreground">
                              ({item.canonicalName})
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {item.sourceName}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={item.isPrimary ? "default" : "secondary"}>
                            {item.isPrimary ? "主要" : "次要"}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingMarathonSourceId(item.id);
                              setEditingMarathonSourceUrl(item.sourceUrl);
                              setEditingMarathonSourcePrimary(Boolean(item.isPrimary));
                            }}
                            disabled={
                              updateMarathonSourceMutation.isPending ||
                              deleteMarathonSourceMutation.isPending
                            }
                          >
                            修改
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              const ok = window.confirm(
                                `确认删除这条绑定？\n${item.marathonName} <- ${item.sourceName}`,
                              );
                              if (!ok) return;
                              deleteMarathonSourceMutation.mutate(item.id);
                            }}
                            disabled={
                              updateMarathonSourceMutation.isPending ||
                              deleteMarathonSourceMutation.isPending
                            }
                          >
                            删除
                          </Button>
                        </div>
                      </div>

                      {editingMarathonSourceId === item.id ? (
                        <div className="mt-2 space-y-2 rounded-lg border p-2">
                          <Input
                            value={editingMarathonSourceUrl}
                            onChange={(e) => setEditingMarathonSourceUrl(e.target.value)}
                            placeholder="https://..."
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant={editingMarathonSourcePrimary ? "default" : "outline"}
                              onClick={() =>
                                setEditingMarathonSourcePrimary((v) => !v)
                              }
                              disabled={
                                item.sourceType !== "official" ||
                                updateMarathonSourceMutation.isPending
                              }
                            >
                              {editingMarathonSourcePrimary ? "主要" : "次要"}
                            </Button>
                            {item.sourceType !== "official" ? (
                              <span className="text-xs text-muted-foreground">
                                第三方来源固定为次要
                              </span>
                            ) : null}
                            <Button
                              size="sm"
                              onClick={() =>
                                updateMarathonSourceMutation.mutate({
                                  id: item.id,
                                  sourceUrl: editingMarathonSourceUrl.trim(),
                                  isPrimary: editingMarathonSourcePrimary,
                                })
                              }
                              disabled={
                                updateMarathonSourceMutation.isPending ||
                                !editingMarathonSourceUrl.trim()
                              }
                            >
                              保存修改
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingMarathonSourceId(null)}
                              disabled={updateMarathonSourceMutation.isPending}
                            >
                              取消
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground mt-2 break-all">
                          {item.sourceUrl}
                        </div>
                      )}

                      <div className="text-xs text-muted-foreground mt-2">
                        上次检查：{formatDateTime(item.lastCheckedAt)} / 下次检查：
                        {formatDateTime(item.nextCheckAt)} / HTTP={item.lastHttpStatus ?? "-"}
                      </div>
                      {item.lastError ? (
                        <div className="text-xs text-destructive mt-2 break-all">{item.lastError}</div>
                      ) : null}
                    </div>
                  ))}
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
              <strong>什么是待审核（needs_review）？</strong>
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
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm md:w-80"
                value={rawStatus}
                onChange={(e) => setRawStatus(e.target.value)}
              >
                {RAW_STATUS_FILTER_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}（{item.value}）
                  </option>
                ))}
              </select>
              <div className="text-xs text-muted-foreground flex items-center">
                默认查看待审核（needs_review）
              </div>
            </div>

            {(rawQuery.data?.data ?? []).map((row) => {
              const method = (row.metadata as any)?.extraction?.method;
              return (
                <div key={row.id} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant={row.status === "needs_review" ? "destructive" : "secondary"}>
                        {formatRawStatusLabel(row.status)}
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
                        setResolveName("");
                        setResolveCanonicalName("");
                        setResolveRegion("China");
                        setResolveCity("");
                        setResolveCountry("");
                        setResolveWebsiteUrl("");
                        setResolveDescription("");
                        setResolveCanonicalUnlocked(false);
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

                  <div className="rounded-lg border bg-background p-3 space-y-2 text-sm">
                    <div className="font-medium">字段说明</div>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1">
                      <li>赛事基础资料（名称/地点/国家/简介/官网）在此也可直接修改。</li>
                      <li>`比赛日期` 建议使用 `YYYY-MM-DD`。</li>
                      <li>`报名状态` 必须从选项中选择（用于前台状态筛选与展示）。</li>
                      <li>`报名网址` 建议填写可直接报名或查看报名信息的详情页。</li>
                    </ul>
                    <div className="text-xs text-muted-foreground">
                      metadata（只读）是本次抓取过程的机器结果快照（提取值、方法、合并结果等），不等于你最终保存值；最终以你在本弹窗保存的数据为准。
                    </div>
                  </div>

                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="text-sm font-medium">赛事基础资料（详情页展示）</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Input
                        placeholder="赛事名称（必填）"
                        value={resolveName}
                        onChange={(e) => setResolveName(e.target.value)}
                      />
                      <Input
                        placeholder="canonicalName（建议小写+连字符）"
                        value={resolveCanonicalName}
                        onChange={(e) => setResolveCanonicalName(e.target.value)}
                        readOnly={!resolveCanonicalUnlocked}
                      />
                      <Input
                        placeholder="地点/城市（可选）"
                        value={resolveCity}
                        onChange={(e) => setResolveCity(e.target.value)}
                      />
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={resolveRegion}
                        onChange={(e) => {
                          const next = e.target.value as "China" | "Overseas";
                          setResolveRegion(next);
                          if (next === "China") setResolveCountry("");
                        }}
                      >
                        <option value="China">中国</option>
                        <option value="Overseas">非中国（海外）</option>
                      </select>
                      <Input
                        placeholder={
                          resolveRegion === "China"
                            ? "国家/地区将自动保存为 China"
                            : "国家（必填，例如：Japan、USA）"
                        }
                        value={resolveCountry}
                        onChange={(e) => setResolveCountry(e.target.value)}
                        disabled={resolveRegion === "China"}
                      />
                      <Input
                        placeholder="官网 URL（可选）"
                        value={resolveWebsiteUrl}
                        onChange={(e) => setResolveWebsiteUrl(e.target.value)}
                      />
                    </div>
                    <Textarea
                      placeholder="赛事简介（可选）"
                      value={resolveDescription}
                      onChange={(e) => setResolveDescription(e.target.value)}
                      rows={3}
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={resolveCanonicalUnlocked ? "default" : "outline"}
                        type="button"
                        onClick={() => setResolveCanonicalUnlocked((v) => !v)}
                      >
                        {resolveCanonicalUnlocked ? "已解锁 canonicalName 编辑" : "解锁 canonicalName 编辑"}
                      </Button>
                      <div className="text-xs text-muted-foreground">
                        已有赛事一般不建议改 canonicalName，避免影响系列赛事关联。
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="text-sm font-medium">届次信息（详情页展示）</div>
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
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={resolveStatus}
                      onChange={(e) => setResolveStatus(e.target.value)}
                    >
                      <option value="">报名状态（请选择）</option>
                      {REGISTRATION_STATUS_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      placeholder="报名网址（完整网址，例如：https://...）"
                      value={resolveRegUrl}
                      onChange={(e) => setResolveRegUrl(e.target.value)}
                    />
                  </div>
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
                      保存审核结果
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
                    <div className="text-xs text-muted-foreground">
                      用途：基于当前 rawContent 自动生成 `sources.config.extract` 的选择器规则（不是直接修改 metadata）。
                      你需要先点“生成模板”查看预览，再点“写入到数据源配置”，最后可点“保存并验证（单条同步）”验证规则是否可用。
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
                        <Badge variant="secondary">模型：{aiTemplateMutation.data.data.model}</Badge>
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
                          模板 JSON（可编辑；会把 `extract` 合并写入数据源配置 `config.extract`）
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
                            写入到数据源配置
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
