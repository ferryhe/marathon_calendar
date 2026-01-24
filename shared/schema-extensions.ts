// Schema extensions for crawler features

// 1. Pending Changes Tracking
const pendingChanges = {
    // Track changes that are yet to be applied
    changes: [],
    addChange(change) {
        this.changes.push(change);
    },
    clearChanges() {
        this.changes = [];
    },
};

// 2. Change Detection Logs
const changeDetectionLogs = {
    logs: [],
    logChange(changeDetail) {
        this.logs.push({
            ...changeDetail,
            timestamp: new Date().toISOString(),
        });
    },
    clearLogs() {
        this.logs = [];
    },
};

// 3. Data Verification Status
const dataVerificationStatus = {
    status: 'pending', // can be 'pending', 'verified', 'failed'
    setStatus(newStatus) {
        this.status = newStatus;
    },
};

export { pendingChanges, changeDetectionLogs, dataVerificationStatus };