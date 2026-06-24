// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  createPost,
  deletePost,
  editPost,
  listPostsPage,
  readSharePrefs,
  writeSharePrefs,
} from "./circle-thread";

const ME = "user-self";
const FRIEND = "user-friend";

function basePost(over: Partial<Parameters<typeof createPost>[0]> = {}) {
  return {
    circleId: "circle-1",
    body: "what i'm metabolising",
    kind: "reflection" as const,
    authorName: "Self",
    authorId: ME,
    anonymous: false,
    shareProgress: false,
    ...over,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("circle thread permissions", () => {
  it("anonymous=true strips the author display name", () => {
    const post = createPost(basePost({ anonymous: true, authorName: "Sara K" }));
    expect(post.anonymous).toBe(true);
    expect(post.authorName).toBe("Anonymous");
    expect(post.authorId).toBe(ME); // authorId still recorded for owner checks
  });

  it("shareProgress=false drops the snapshot even if progress data is passed", () => {
    const post = createPost(
      basePost({ shareProgress: false, progress: { bmr: 1670, streak: 9 } }),
    );
    expect(post.progress).toBeUndefined();
    expect(post.shareProgress).toBe(false);
  });

  it("shareProgress=true keeps the snapshot exactly as passed", () => {
    const post = createPost(
      basePost({ shareProgress: true, progress: { bmr: 1670, streak: 9 } }),
    );
    expect(post.progress).toEqual({ bmr: 1670, streak: 9 });
  });

  it("editPost refuses to modify another user's post (cross-user write blocked)", () => {
    const post = createPost(basePost({ body: "mine" }));
    expect(() => editPost(post.id, FRIEND, "hacked")).toThrow(
      /only edit your own posts/i,
    );
    const { posts } = listPostsPage(post.circleId, { limit: 10 });
    expect(posts[0].body).toBe("mine");
    expect(posts[0].editedAt).toBeUndefined();
  });

  it("deletePost refuses to remove another user's post (cross-user delete blocked)", () => {
    const post = createPost(basePost());
    expect(() => deletePost(post.id, FRIEND)).toThrow(
      /only delete your own posts/i,
    );
    expect(listPostsPage(post.circleId, { limit: 10 }).posts).toHaveLength(1);
  });

  it("editPost succeeds for the original author and stamps editedAt", () => {
    const post = createPost(basePost({ body: "v1" }));
    const updated = editPost(post.id, ME, "v2");
    expect(updated.body).toBe("v2");
    expect(updated.editedAt).toBeGreaterThanOrEqual(updated.createdAt);
  });

  it("allowProgressVisibility=false in prefs is the user-controlled global gate", () => {
    writeSharePrefs({ allowProgressVisibility: false });
    expect(readSharePrefs().allowProgressVisibility).toBe(false);
    // The composer respects this by passing shareProgress=false; verify the
    // store honors whatever the caller passed (the gate is enforced in UI
    // before createPost is called).
    const post = createPost(
      basePost({ shareProgress: false, progress: { bmr: 1700 } }),
    );
    expect(post.progress).toBeUndefined();
  });
});

describe("circle thread pagination", () => {
  it("returns the newest page first and exposes a cursor for older posts", async () => {
    // Insert 12 posts with predictable createdAt values.
    for (let i = 0; i < 12; i++) {
      // tiny delay so createdAt monotonically increases on platforms with
      // coarse clocks
      await new Promise((r) => setTimeout(r, 1));
      createPost(basePost({ body: `post ${i}` }));
    }
    const first = listPostsPage("circle-1", { limit: 5 });
    expect(first.posts).toHaveLength(5);
    expect(first.posts[0].body).toBe("post 11");
    expect(first.nextBefore).toBeTruthy();

    const second = listPostsPage("circle-1", {
      limit: 5,
      before: first.nextBefore!,
    });
    expect(second.posts).toHaveLength(5);
    expect(second.posts[0].body).toBe("post 6");
  });
});

/**
 * Share-link RLS is enforced at the database, not in this on-device store.
 * We assert the migration scopes every write to the owning user, mirroring
 * the subscriptions RLS test pattern.
 */
describe("share_links RLS policies", () => {
  it("scopes every mutation on share_links to the owner", () => {
    const dir = join(process.cwd(), "supabase", "migrations");
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");

    expect(sql).toMatch(/create\s+table\s+public\.share_links/i);
    expect(sql).toMatch(
      /alter\s+table\s+public\.share_links\s+enable\s+row\s+level\s+security/i,
    );
    for (const verb of ["select", "insert", "update", "delete"] as const) {
      const re = new RegExp(
        `on\\s+public\\.share_links\\s+for\\s+${verb}[\\s\\S]*?auth\\.uid\\(\\)\\s*=\\s*user_id`,
        "i",
      );
      expect(sql).toMatch(re);
    }
    // No broad anon SELECT on the base table (must go through get_share_link()).
    expect(sql).not.toMatch(/grant\s+select\s+on\s+public\.share_links\s+to\s+anon/i);
    // Public lookup function returns only safe fields and filters revoked links.
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.get_share_link/i);
    expect(sql).toMatch(/revoked_at\s+is\s+null/i);
  });
});