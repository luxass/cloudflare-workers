import { describe, expect, it } from "vitest";

import approvalNotification from "./fixtures/approval-requested-notification.json";
import pendingDeployment from "./fixtures/approval-requested-pending-deployment.json";
import closedAuthorNotification from "./fixtures/closed-author-pr-notification.json";
import closedAuthorSubject from "./fixtures/closed-author-pr-subject.json";
import coderabbitNotification from "./fixtures/coderabbit-pr-notification.json";
import coderabbitSubject from "./fixtures/coderabbit-pr-subject.json";
import huginnNotification from "./fixtures/huginn-pr-notification.json";
import huginnSubject from "./fixtures/huginn-pr-subject.json";
import mentionNotification from "./fixtures/mention-pr-notification.json";
import mentionSubject from "./fixtures/mention-pr-subject.json";
import pendingReviewNotification from "./fixtures/pending-review-pr-notification.json";
import pendingReviewSubject from "./fixtures/pending-review-pr-subject.json";
import renovateNotification from "./fixtures/renovate-pr-notification.json";
import renovateSubject from "./fixtures/renovate-pr-subject.json";
import releaseNotification from "./fixtures/release-notification.json";
import staleReviewNotification from "./fixtures/stale-review-pr-notification.json";
import staleReviewSubject from "./fixtures/stale-review-pr-subject.json";
import teamReviewNotification from "./fixtures/team-review-pr-notification.json";
import teamReviewSubject from "./fixtures/team-review-pr-subject.json";
import unsupportedWorkflowNotification from "./fixtures/unsupported-workflow-notification.json";
import workflowFailureNotification from "./fixtures/workflow-failure-notification.json";
import type { GitHubNotification, GitHubPendingDeploymentWithRun, GitHubSubject } from "../src/github";
import { classifyNotification } from "../src/policy";

describe("notification policy", () => {
  it("fetches a pull request subject before classifying the notification", async () => {
    const notification = renovateNotification as GitHubNotification;
    const subject = renovateSubject as GitHubSubject;
    const subjectReads: GitHubNotification[] = [];

    const result = await classifyNotification(notification, async (notification) => {
      subjectReads.push(notification);
      return subject;
    });

    expect(subjectReads).toEqual([notification]);
    expect(result.subject).toBe(subject);
    expect(result.subjectAuthor).toBe("renovate[bot]");
    expect(result.decision).toEqual({
      action: "mark-done",
      reason: "subject identity renovate is always auto-done",
    });
  });

  it("classifies workflow failure notifications without fetching a subject", async () => {
    const notification = workflowFailureNotification as GitHubNotification;
    const subjectReads: GitHubNotification[] = [];

    const result = await classifyNotification(notification, async (notification) => {
      subjectReads.push(notification);
      throw new Error("subject should not be fetched");
    });

    expect(subjectReads).toEqual([]);
    expect(result.subject).toBeUndefined();
    expect(result.subjectAuthor).toBe("unknown");
    expect(result.decision).toEqual({
      action: "mark-done",
      reason: "workflow failure ci_activity is auto-done",
    });
  });

  it("marks approval requests done when no workflow run is waiting for deployment approval", async () => {
    const notification = approvalNotification as GitHubNotification;
    const subjectReads: GitHubNotification[] = [];
    const pendingDeploymentReads: GitHubNotification[] = [];

    const result = await classifyNotification(notification, {
      listPendingDeployments: async (notification) => {
        pendingDeploymentReads.push(notification);
        return [];
      },
      now: new Date("2026-06-11T01:00:00.000Z"),
      readSubject: async (notification) => {
        subjectReads.push(notification);
        throw new Error("subject should not be fetched");
      },
    });

    expect(subjectReads).toEqual([]);
    expect(pendingDeploymentReads).toEqual([notification]);
    expect(result.subject).toBeUndefined();
    expect(result.subjectAuthor).toBe("unknown");
    expect(result.pendingDeployments).toEqual([]);
    expect(result.decision).toEqual({
      action: "mark-done",
      reason: "approval request has no pending deployments",
    });
  });

  it("keeps approval requests while a workflow run is waiting for deployment approval", async () => {
    const notification = approvalNotification as GitHubNotification;
    const deployment = pendingDeployment as GitHubPendingDeploymentWithRun;
    const subjectReads: GitHubNotification[] = [];
    const pendingDeploymentReads: GitHubNotification[] = [];

    const result = await classifyNotification(notification, {
      listPendingDeployments: async (notification) => {
        pendingDeploymentReads.push(notification);
        return [deployment];
      },
      now: new Date("2026-06-11T01:00:00.000Z"),
      readSubject: async (notification) => {
        subjectReads.push(notification);
        throw new Error("subject should not be fetched");
      },
    });

    expect(subjectReads).toEqual([]);
    expect(pendingDeploymentReads).toEqual([notification]);
    expect(result.subject).toBeUndefined();
    expect(result.subjectAuthor).toBe("unknown");
    expect(result.pendingDeployments).toEqual([deployment]);
    expect(result.decision).toEqual({
      action: "keep",
      reason: "approval request still has pending deployments",
    });
  });

  it("keeps a review request when GitHub still lists a requested reviewer", async () => {
    const notification = pendingReviewNotification as GitHubNotification;
    const subject = pendingReviewSubject as GitHubSubject;
    const subjectReads: GitHubNotification[] = [];

    const result = await classifyNotification(notification, async (notification) => {
      subjectReads.push(notification);
      return subject;
    });

    expect(subjectReads).toEqual([notification]);
    expect(result.subject).toBe(subject);
    expect(result.subjectAuthor).toBe("luxass");
    expect(result.decision).toEqual({
      action: "keep",
      reason: "pull request review request is still pending",
    });
  });

  it("keeps a review request when GitHub still lists a requested team", async () => {
    const notification = teamReviewNotification as GitHubNotification;
    const subject = teamReviewSubject as GitHubSubject;
    const subjectReads: GitHubNotification[] = [];

    const result = await classifyNotification(notification, async (notification) => {
      subjectReads.push(notification);
      return subject;
    });

    expect(subjectReads).toEqual([notification]);
    expect(result.subject).toBe(subject);
    expect(result.subjectAuthor).toBe("luxass");
    expect(result.decision).toEqual({
      action: "keep",
      reason: "pull request review request is still pending",
    });
  });

  it("keeps a review request when the subject fetch returns nothing", async () => {
    const notification = staleReviewNotification as GitHubNotification;
    const subjectReads: GitHubNotification[] = [];

    const result = await classifyNotification(notification, async (notification) => {
      subjectReads.push(notification);
      return undefined;
    });

    expect(subjectReads).toEqual([notification]);
    expect(result.subject).toBeUndefined();
    expect(result.subjectAuthor).toBe("unknown");
    expect(result.decision).toEqual({
      action: "keep",
      reason: "pull request review request could not be checked",
    });
  });

  it("marks a review request done when GitHub no longer lists reviewers or teams", async () => {
    const notification = staleReviewNotification as GitHubNotification;
    const subject = staleReviewSubject as GitHubSubject;
    const subjectReads: GitHubNotification[] = [];

    const result = await classifyNotification(notification, async (notification) => {
      subjectReads.push(notification);
      return subject;
    });

    expect(subjectReads).toEqual([notification]);
    expect(result.subject).toBe(subject);
    expect(result.subjectAuthor).toBe("luxass");
    expect(result.decision).toEqual({
      action: "mark-done",
      reason: "pull request review request is no longer pending",
    });
  });

  it("marks an author notification done after the pull request closes", async () => {
    const notification = closedAuthorNotification as GitHubNotification;
    const subject = closedAuthorSubject as GitHubSubject;
    const subjectReads: GitHubNotification[] = [];

    const result = await classifyNotification(notification, async (notification) => {
      subjectReads.push(notification);
      return subject;
    });

    expect(subjectReads).toEqual([notification]);
    expect(result.subject).toBe(subject);
    expect(result.subjectAuthor).toBe("luxass");
    expect(result.decision).toEqual({
      action: "mark-done",
      reason: "pull request author notification is closed",
    });
  });

  it("marks a never-auto-done bot done after the pull request closes", async () => {
    const notification = huginnNotification as GitHubNotification;
    const subject = huginnSubject as GitHubSubject;
    const subjectReads: GitHubNotification[] = [];

    const result = await classifyNotification(notification, async (notification) => {
      subjectReads.push(notification);
      return subject;
    });

    expect(subjectReads).toEqual([notification]);
    expect(result.subject).toBe(subject);
    expect(result.subjectAuthor).toBe("huginn-watch[bot]");
    expect(result.decision).toEqual({
      action: "mark-done",
      reason: "pull request review_requested notification is closed",
    });
  });

  it("marks an always-auto-done app identity done when the subject has no user", async () => {
    const notification = coderabbitNotification as GitHubNotification;
    const subject = coderabbitSubject as GitHubSubject;
    const subjectReads: GitHubNotification[] = [];

    const result = await classifyNotification(notification, async (notification) => {
      subjectReads.push(notification);
      return subject;
    });

    expect(subjectReads).toEqual([notification]);
    expect(result.subject).toBe(subject);
    expect(result.subjectAuthor).toBe("coderabbitai");
    expect(result.decision).toEqual({
      action: "mark-done",
      reason: "subject identity coderabbitai is always auto-done",
    });
  });

  it("keeps protected human mentions", async () => {
    const notification = mentionNotification as GitHubNotification;
    const subject = mentionSubject as GitHubSubject;
    const subjectReads: GitHubNotification[] = [];

    const result = await classifyNotification(notification, async (notification) => {
      subjectReads.push(notification);
      return subject;
    });

    expect(subjectReads).toEqual([notification]);
    expect(result.subject).toBe(subject);
    expect(result.subjectAuthor).toBe("luxass");
    expect(result.decision).toEqual({
      action: "keep",
      reason: "notification reason mention is protected",
    });
  });

  it("marks subscribed release notifications done without fetching a subject", async () => {
    const notification = releaseNotification as GitHubNotification;
    const subjectReads: GitHubNotification[] = [];

    const result = await classifyNotification(notification, async (notification) => {
      subjectReads.push(notification);
      throw new Error("subject should not be fetched");
    });

    expect(subjectReads).toEqual([]);
    expect(result.subject).toBeUndefined();
    expect(result.subjectAuthor).toBe("unknown");
    expect(result.decision).toEqual({
      action: "mark-done",
      reason: "release subscribed notification is auto-done",
    });
  });

  it("keeps unsupported workflow notifications without fetching a subject", async () => {
    const notification = unsupportedWorkflowNotification as GitHubNotification;
    const subjectReads: GitHubNotification[] = [];

    const result = await classifyNotification(notification, async (notification) => {
      subjectReads.push(notification);
      throw new Error("subject should not be fetched");
    });

    expect(subjectReads).toEqual([]);
    expect(result.subject).toBeUndefined();
    expect(result.subjectAuthor).toBe("unknown");
    expect(result.decision).toEqual({
      action: "keep",
      reason: "subject type WorkflowRun is not supported",
    });
  });
});
