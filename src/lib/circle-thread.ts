/**
 * On-device discussion threads for circles. Each post can be authored
 * anonymously and can opt-in to sharing the author's current BMR / streak
 * snapshot ("progress sharing"). Lives in localStorage until the backend
 * sync ships.
 */
import { useEffect, useState } from "react";

export type SharedProgress = {
  bmr?: number;
  streak?: number;
  pulse?: number;
};

export type CirclePost = {
  id: string;
  circleId: string;
  body: string;
  kind: "reflection" | "insight" | "support";
  authorName: string; // display label after anon resolution
  /** Stable identifier of the local author (profile id when signed in).
   *  Used as the permission boundary for edit/delete. */
  authorId: string;
  anonymous: boolean;
  shareProgress: boolean;
  progress?: SharedProgress;
  createdAt: number;
  editedAt?: number;
};

const KEY = "metabyx:circle:posts:v1";
const EVENT = "metabyx:circle:posts:change";
const PREFS_KEY = "metabyx:circle:share-prefs:v1";
const MAX = 200;

export type SharePrefs = {
  defaultAnonymous: boolean;
  defaultShareProgress: boolean;
  allowProgressVisibility: boolean; // global toggle: do others get to see my progress at all?
};

const DEFAULT_PREFS: SharePrefs = {
  defaultAnonymous: false,
  defaultShareProgress: false,
  allowProgressVisibility: true,
};

function read(): CirclePost[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CirclePost[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(posts: CirclePost[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(posts.slice(0, MAX)));
  window.dispatchEvent(new Event(EVENT));
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function readSharePrefs(): SharePrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<SharePrefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writeSharePrefs(p: Partial<SharePrefs>) {
  if (typeof window === "undefined") return;
  const next = { ...readSharePrefs(), ...p };
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
}

export function useSharePrefs(): [SharePrefs, (p: Partial<SharePrefs>) => void] {
  const [prefs, setPrefs] = useState<SharePrefs>(() => readSharePrefs());
  useEffect(() => {
    const sync = () => setPrefs(readSharePrefs());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return [
    prefs,
    (p) => {
      writeSharePrefs(p);
    },
  ];
}

export function listPosts(circleId: string): CirclePost[] {
  return read()
    .filter((p) => p.circleId === circleId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Cursor-paginated reads. `before` is a createdAt timestamp — posts strictly
 * older than that are returned, newest first. Page size is capped to MAX.
 */
export function listPostsPage(
  circleId: string,
  opts: { limit?: number; before?: number } = {},
): { posts: CirclePost[]; nextBefore: number | null } {
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), MAX);
  const all = read()
    .filter((p) => p.circleId === circleId)
    .sort((a, b) => b.createdAt - a.createdAt);
  const filtered = opts.before
    ? all.filter((p) => p.createdAt < opts.before!)
    : all;
  const page = filtered.slice(0, limit);
  const nextBefore =
    filtered.length > limit && page.length > 0
      ? page[page.length - 1].createdAt
      : null;
  return { posts: page, nextBefore };
}

export function createPost(input: {
  circleId: string;
  body: string;
  kind: CirclePost["kind"];
  authorName: string;
  authorId: string;
  anonymous: boolean;
  shareProgress: boolean;
  progress?: SharedProgress;
}): CirclePost {
  const trimmed = input.body.trim();
  if (!trimmed) throw new Error("Add a few words before posting.");
  if (trimmed.length > 600) throw new Error("Keep it under 600 characters.");
  if (!input.authorId) throw new Error("Sign in before posting.");
  const post: CirclePost = {
    id: newId(),
    circleId: input.circleId,
    body: trimmed,
    kind: input.kind,
    authorName: input.anonymous ? "Anonymous" : input.authorName || "Friend",
    authorId: input.authorId,
    anonymous: input.anonymous,
    shareProgress: input.shareProgress,
    progress: input.shareProgress ? input.progress : undefined,
    createdAt: Date.now(),
  };
  write([post, ...read()]);
  return post;
}

/**
 * Local owner-only mutation. The caller must pass their `authorId`; mismatched
 * ids throw. The on-device store is single-user, but enforcing the check here
 * keeps the permission boundary explicit and the tests honest.
 */
export function editPost(id: string, authorId: string, nextBody: string): CirclePost {
  const trimmed = nextBody.trim();
  if (!trimmed) throw new Error("Post can't be empty.");
  if (trimmed.length > 600) throw new Error("Keep it under 600 characters.");
  const posts = read();
  const idx = posts.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error("Post not found.");
  if (posts[idx].authorId !== authorId) {
    throw new Error("You can only edit your own posts.");
  }
  const next: CirclePost = {
    ...posts[idx],
    body: trimmed,
    editedAt: Date.now(),
  };
  const out = [...posts];
  out[idx] = next;
  write(out);
  return next;
}

export function deletePost(id: string, authorId: string) {
  const posts = read();
  const target = posts.find((p) => p.id === id);
  if (!target) return;
  if (target.authorId !== authorId) {
    throw new Error("You can only delete your own posts.");
  }
  write(posts.filter((p) => p.id !== id));
}

export function usePosts(circleId: string): CirclePost[] {
  const [posts, setPosts] = useState<CirclePost[]>(() => listPosts(circleId));
  useEffect(() => {
    const sync = () => setPosts(listPosts(circleId));
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [circleId]);
  return posts;
}