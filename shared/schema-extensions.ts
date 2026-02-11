// Schema extensions for crawler features.
// Note: these are lightweight in-memory helpers; canonical state lives in Postgres.

export type PendingChange = Record<string, unknown>;

export const pendingChanges = {
  changes: [] as PendingChange[],
  addChange(change: PendingChange) {
    pendingChanges.changes.push(change);
  },
  clearChanges() {
    pendingChanges.changes = [];
  },
};

export type ChangeLogDetail = Record<string, unknown>;

export const changeDetectionLogs = {
  logs: [] as Array<ChangeLogDetail & { timestamp: string }>,
  logChange(changeDetail: ChangeLogDetail) {
    changeDetectionLogs.logs.push({
      ...changeDetail,
      timestamp: new Date().toISOString(),
    });
  },
  clearLogs() {
    changeDetectionLogs.logs = [];
  },
};

export type VerificationStatus = "pending" | "verified" | "failed";

export const dataVerificationStatus = {
  status: "pending" as VerificationStatus,
  setStatus(newStatus: VerificationStatus) {
    dataVerificationStatus.status = newStatus;
  },
};
