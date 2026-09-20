import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  STATUS_COLOR_CLASSES,
  STATUS_I18N_KEY,
  type DisplayEditionStatus,
  resolveEditionStatus,
} from "@shared/status";

export interface StatusBadgeProps {
  status?: DisplayEditionStatus | string | null;
  raceDate?: string | Date | null;
  registrationStart?: string | Date | null;
  registrationEnd?: string | Date | null;
  /** 官网采集的报名状态（registration_status） */
  registrationStatus?: string | null;
  /**
   * 是否抽签制。文案按它分口径：
   *  抽签类（isLottery=true） → 「抽签报名中 / 抽签已截止」
   *  非抽签类（false/undefined）→ 「报名中 / 报名已截止」
   * 为什么不写死一套：波马是达标成绩制不是抽签，显示"抽签已截止"会误导；反之抽签赛事（纽约）说"报名已截止"也不准。
   */
  isLottery?: boolean | null;
  // When true, the "open" badge gets the attention glow effect.
  glow?: boolean;
  className?: string;
  size?: "sm" | "md";
}

// Single-source status pill. Resolves the status from explicit value, legacy
// Chinese string, and date fallbacks — so existing rows render correctly even
// before migration.
export function StatusBadge({
  status,
  raceDate,
  registrationStart,
  registrationEnd,
  registrationStatus,
  isLottery,
  glow = true,
  className,
  size = "sm",
}: StatusBadgeProps) {
  const { t } = useTranslation();
  const resolved: DisplayEditionStatus = resolveEditionStatus({
    status: typeof status === "string" ? status : null,
    raceDate,
    registrationStart,
    registrationEnd,
    registrationStatus,
  });

  // 抽签/报名两种口径的文案分流（见 isLottery 注释）
  const labelKey =
    resolved === "closed"
      ? isLottery
        ? STATUS_I18N_KEY.closed
        : "status.closedGeneral"
      : resolved === "open"
        ? isLottery
          ? STATUS_I18N_KEY.open
          : "status.openGeneral"
        : STATUS_I18N_KEY[resolved];
  const label = t(labelKey);
  const colorClasses = STATUS_COLOR_CLASSES[resolved];
  const sizeClasses =
    size === "md"
      ? "text-xs px-2.5 py-1 rounded-full"
      : "text-[10px] px-2 py-0.5 h-5 rounded-full";

  return (
    <span
      data-testid={`status-${resolved}`}
      className={cn(
        "inline-flex items-center justify-center border font-semibold leading-none whitespace-nowrap",
        colorClasses,
        sizeClasses,
        glow && resolved === "open" && "status-open-glow",
        className,
      )}
    >
      {label}
    </span>
  );
}
