function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
}
function normalizedRecipients(recipients) {
    const unique = new Map();
    for (const recipient of recipients) {
        const email = recipient.email.trim().toLowerCase();
        if (email && !unique.has(email))
            unique.set(email, { name: recipient.name.trim() || email, email });
    }
    return [...unique.values()];
}
export class EmailService {
    config;
    fetcher;
    reportError;
    token = null;
    constructor(config, fetcher = fetch, reportError = () => { }) {
        this.config = config;
        this.fetcher = fetcher;
        this.reportError = reportError;
    }
    async sendEstimateAssignment(message) {
        const recipients = normalizedRecipients(message.recipients);
        if (this.config.mode === "Disabled")
            return { status: "disabled", recipients: recipients.map((recipient) => recipient.email) };
        if (recipients.length === 0)
            return { status: "sent", recipients: [] };
        try {
            const accessToken = await this.accessToken();
            const appUrl = `${this.config.applicationBaseUrl.replace(/\/$/, "")}/`;
            const response = await this.fetcher(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.config.senderUser)}/sendMail`, {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                signal: AbortSignal.timeout(10_000),
                body: JSON.stringify({
                    message: {
                        subject: `[IoT Team Center] Assigned: ${message.estimateNumber} · ${message.section}`,
                        body: {
                            contentType: "HTML",
                            content: `<p>คุณได้รับมอบหมายงาน Estimate Cost / You have been assigned an Estimate Cost section.</p>`
                                + `<table><tr><td><strong>Estimate</strong></td><td>${escapeHtml(message.estimateNumber)}</td></tr>`
                                + `<tr><td><strong>Project</strong></td><td>${escapeHtml(message.projectName)}</td></tr>`
                                + `<tr><td><strong>Section</strong></td><td>${escapeHtml(message.section)}</td></tr>`
                                + `<tr><td><strong>Due date</strong></td><td>${escapeHtml(message.dueDate)}</td></tr>`
                                + `<tr><td><strong>Assigned by</strong></td><td>${escapeHtml(message.assignedBy)}</td></tr></table>`
                                + `<p><a href="${escapeHtml(appUrl)}">Open IoT Team Center</a> แล้วไปที่ Estimate Cost หมายเลข ${escapeHtml(message.estimateNumber)}</p>`,
                        },
                        toRecipients: recipients.map((recipient) => ({ emailAddress: { address: recipient.email, name: recipient.name } })),
                    },
                }),
            });
            if (!response.ok)
                throw new Error(`Microsoft Graph sendMail returned HTTP ${response.status}.`);
            return { status: "sent", recipients: recipients.map((recipient) => recipient.email) };
        }
        catch (error) {
            this.reportError(error);
            return { status: "failed", recipients: recipients.map((recipient) => recipient.email) };
        }
    }
    async accessToken() {
        if (this.token && this.token.expiresAt > Date.now() + 60_000)
            return this.token.value;
        const body = new URLSearchParams({
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            grant_type: "client_credentials",
            scope: "https://graph.microsoft.com/.default",
        });
        const response = await this.fetcher(`https://login.microsoftonline.com/${encodeURIComponent(this.config.tenantId)}/oauth2/v2.0/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok)
            throw new Error(`Microsoft identity token endpoint returned HTTP ${response.status}.`);
        const payload = await response.json();
        if (!payload.access_token)
            throw new Error("Microsoft identity token response did not contain an access token.");
        this.token = { value: payload.access_token, expiresAt: Date.now() + Math.max(payload.expires_in ?? 300, 60) * 1_000 };
        return this.token.value;
    }
}
//# sourceMappingURL=email.js.map