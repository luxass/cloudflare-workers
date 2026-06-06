export interface Env extends CloudflareBindings {}

export interface PollState {
  lastModified?: string;
  nextPollAt?: number;
}

export interface GitHubNotification {
  id: string;
  reason: string;
  updated_at: string;
  repository: {
    full_name: string;
  };
  subject: {
    title: string;
    type: string;
    url: string | null;
  };
}

export interface GitHubSubject {
  html_url?: string;
  number?: number;
  state?: string;
  user?: {
    login?: string;
    type?: string;
  } | null;
}

export interface AuditEntry {
  action: "marked-done" | "kept" | "failed";
  reason: string;
  notificationId: string;
  repository: string;
  subjectTitle: string;
  subjectType: string;
  notificationReason: string;
  subjectAuthor?: string;
  htmlUrl?: string;
  createdAt: string;
}

export interface ProcessedNotification {
  id: string;
  repository: string;
  title: string;
  action: "marked-done" | "kept" | "failed";
  reason: string;
}
