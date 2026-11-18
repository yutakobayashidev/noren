import { t } from "../../lib/i18n";
import { useState, useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import type { SocialPost } from "../../domain/model";
import { postIdentity } from "../../domain/model";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import { PostCard } from "./post-card";
import type { PostInteractions } from "./timeline";
import { api, errorMessage } from "../../lib/api";
import { Button } from "../../components/ui/button";
export function ThreadDialog({
  post,
  onClose,
  ...interactions
}: { post: SocialPost | null; onClose: () => void } & PostInteractions) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!post) return;
    const abort = new AbortController();
    setPosts([post]);
    setError("");
    setLoading(true);
    api<{ posts: SocialPost[] }>("/api/thread", post, undefined, abort.signal)
      .then((d) => setPosts(d.posts))
      .catch((e) => {
        if (!abort.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [post?.key, post?.accountId, retry]);
  return (
    <Dialog
      open={!!post}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="max-w-2xl bg-background px-3">
        <DialogTitle className="mb-4 px-3 text-xl font-semibold">
          {t("Conversation")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("Post and replies")}
        </DialogDescription>
        {error && (
          <div className="feed-error" role="alert">
            <p>{error}</p>
            <Button onClick={() => setRetry((n) => n + 1)} size="sm">
              {t("Retry")}
            </Button>
          </div>
        )}
        {posts.map((p) => (
          <PostCard
            key={postIdentity(p)}
            post={p}
            {...interactions}
            saved={interactions.saved.some(
              (s) => postIdentity(s) === postIdentity(p),
            )}
            onUpdate={(updated) =>
              setPosts((old) =>
                old.map((item) =>
                  postIdentity(item) === postIdentity(updated) ? updated : item,
                ),
              )
            }
          />
        ))}
        {loading && (
          <div className="loading-state" role="status">
            <LoaderCircle className="animate-spin" />
            {t("Loading conversation…")}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
