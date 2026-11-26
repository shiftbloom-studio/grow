// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 shiftbloom studio and contributors
import type { PostHogEnv } from "./posthog";

export interface Env extends PostHogEnv {
  DB: D1Database;
  CHANNEL: DurableObjectNamespace;
  RL_AUTH?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  PUBLIC_URL?: string;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  /** Operator details for the imprint and privacy policy (see README, "Legal pages"). */
  LEGAL_NAME?: string;
  LEGAL_BUSINESS?: string;
  LEGAL_STREET?: string;
  LEGAL_CITY?: string;
  LEGAL_COUNTRY?: string;
  LEGAL_EMAIL?: string;
  LEGAL_PHONE?: string;
  LEGAL_VAT_ID?: string;
  LEGAL_AUTHORITY?: string;
  POSTHOG_LOGS?: string;
}

export type Role = "everyone" | "subscriber" | "vip" | "moderator" | "broadcaster";

export interface Task {
  id: string;
  userId: string;
  login: string;
  displayName: string;
  color: string;
  text: string;
  done: boolean;
  createdAt: number;
  doneAt: number | null;
  position: number;
}

export interface Settings {
  title: string;
  twitchLogin: string;
  chatEnabled: boolean;
  prefix: string;
  minRole: Role;
  maxPerUser: number;
  maxTasks: number;
  showDone: boolean;
  groupByUser: boolean;
  theme: "glass" | "minimal" | "neon" | "paper" | "bloom";
  accent: string;
  fontSize: number;
  width: number;
  maxHeight: number;
  autoScroll: boolean;
  scrollSpeed: number;
  /** Show a short notice on the overlay when chat tries something that isn't allowed. */
  showRejections: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  title: "Today's tasks",
  twitchLogin: "",
  chatEnabled: true,
  prefix: "!",
  minRole: "everyone",
  maxPerUser: 3,
  maxTasks: 150,
  showDone: true,
  groupByUser: true,
  theme: "glass",
  accent: "#FF2E52",
  fontSize: 18,
  width: 420,
  maxHeight: 640,
  autoScroll: true,
  scrollSpeed: 30,
  showRejections: true,
};

export interface ChatUser {
  userId: string;
  login: string;
  displayName: string;
  color: string;
  roles: Role[];
}
