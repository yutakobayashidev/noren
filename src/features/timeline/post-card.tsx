import { PostReadingTools } from "../../plugins/post-reading-tools";
import { postActions, EnabledActions } from "../../plugins/post-actions";
import { AutoTranslate, autoTranslate, cachedTranslation } from "../../plugins/plamo/auto";
import { needsTranslation } from "../../plugins/plamo/language";
import { onModelChange } from "../../plugins/plamo/model";
import { t } from "../../lib/i18n";
import { useState, useContext, useEffect, useRef } from "react";
import { Heart, Repeat2, MessageCircle, Bookmark, ExternalLink, LoaderCircle } from "lucide-react";
import { postIdentity, type SocialPost } from "../../domain/model";
import { PlatformIcon, Avatar } from "../../components/platform";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../../components/ui/dialog";
import { api, errorMessage } from "../../lib/api";
export function safeUrl(value?: string) {
  try {
    const url = new URL(value || "");
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
function timeAgo(date?: string) {
  if (!date) return "";
  const seconds = (Date.now() - Date.parse(date)) / 1000;
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
function PostText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https?:\/\/[^\s<>]+)/g).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={safeUrl(part)}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}
export function PostCard({
  post,
  onReply,
  onThread,
  onProfile,
  onUpdate,
  saved,
  onSave,
  compact = false,
}: {
  post: SocialPost;
  onReply: (post: SocialPost) => void;
  onThread: (post: SocialPost) => void;
  onProfile: (post: SocialPost) => void;
  onUpdate: (post: SocialPost) => void;
  saved: boolean;
  onSave: (post: SocialPost) => void;
  compact?: boolean;
}) {
  const enabledActions = useContext(EnabledActions);
  const auto = useContext(AutoTranslate);
  const card = useRef<HTMLElement>(null);
  const [translated, setTranslated] = useState<{ language: string; text: string } | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [modelVersion, setModelVersion] = useState(0);
  useEffect(() => onModelChange(() => setModelVersion((value) => value + 1)), []);
  const [pluginResult, setPluginResult] = useState("");
  const [downloaded, setDownloaded] = useState(0);
  const [runningPlugin, setRunningPlugin] = useState("");
  const job = useRef<AbortController | null>(null);
  const [inline, setInline] = useState<{ grant: string; text: string } | null>(null);
  useEffect(() => {
    setInline(null);
    setRunningPlugin("");
    setPluginResult("");
    return () => job.current?.abort();
  }, [enabledActions, post.key, post.accountId, post.text]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [media, setMedia] = useState<string | null>(null);
  const concealed = (post.sensitive || post.contentWarning) && !revealed;
  const autoLanguage =
    auto?.enabled && !concealed && needsTranslation(post.text, auto.language, post.language)
      ? auto.language
      : undefined;
  useEffect(() => {
    setShowOriginal(false);
    if (!autoLanguage) return setTranslated(null);
    const done = cachedTranslation(post.text, autoLanguage);
    if (done) return setTranslated({ language: autoLanguage, text: done });
    setTranslated(null);
    const element = card.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    let running: AbortController | null = null;
    // Only posts on screen are queued; leaving the screen drops a request that has not started.
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) {
        running?.abort();
        running = null;
        return;
      }
      if (running) return;
      const controller = new AbortController();
      running = controller;
      autoTranslate(post.text, autoLanguage, controller.signal).then(
        (text) => {
          if (controller.signal.aborted) return;
          observer.disconnect();
          setTranslated({ language: autoLanguage, text });
        },
        () => {
          if (running === controller) running = null;
        },
      );
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      running?.abort();
    };
  }, [autoLanguage, post.text, modelVersion]);
  async function action(kind: "like" | "repost") {
    const active = kind === "like" ? post.liked : post.reposted;
    setBusy(kind);
    setError("");
    try {
      const result = await api<{ post?: SocialPost; uri?: string }>("/api/action", {
        ...post,
        action: active ? `un${kind}` : kind,
      });
      onUpdate(
        result.post ?? {
          ...post,
          ...(kind === "like"
            ? {
                liked: !active,
                likes: Math.max(0, (post.likes || 0) + (active ? -1 : 1)),
                likeUri: result.uri,
              }
            : {
                reposted: !active,
                reposts: Math.max(0, (post.reposts || 0) + (active ? -1 : 1)),
                repostUri: result.uri,
              }),
        },
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <article
      ref={card}
      data-post-id={postIdentity(post)}
      className={`post-card ${compact ? "compact" : ""}`}
    >
      {post.boostedBy && (
        <div className="boost-label">
          <Repeat2 size={13} />
          {post.boostedBy.name} reposted
        </div>
      )}
      <div className="post-layout">
        <button
          className="avatar-button"
          aria-label={`View ${post.author.name}'s posts`}
          onClick={() => onProfile(post)}
        >
          <Avatar
            name={post.author.name}
            url={safeUrl(post.author.avatarUrl)}
            size={compact ? 34 : 42}
          />
        </button>
        <div className="post-body">
          <div className="post-byline">
            <button className="author-name" onClick={() => onProfile(post)}>
              {post.author.name}
            </button>
            <span className="author-handle">@{post.author.handle}</span>
            <span className="post-platform">
              <PlatformIcon platform={post.platform} size={14} />
            </span>
            <time
              dateTime={post.createdAt}
              title={post.createdAt ? new Date(post.createdAt).toLocaleString() : ""}
            >
              {timeAgo(post.createdAt)}
            </time>
          </div>
          {post.community && <p className="text-xs text-muted-foreground">{post.community}</p>}
          {concealed ? (
            <div className="content-warning">
              <p>{post.contentWarning || t("Sensitive content")}</p>
              <Button size="sm" variant="secondary" onClick={() => setRevealed(true)}>
                {t("Show content")}
              </Button>
            </div>
          ) : (
            <>
              <div
                className="post-text"
                lang={translated && !showOriginal ? translated.language : undefined}
              >
                {translated && !showOriginal ? (
                  <PostText text={translated.text} />
                ) : post.html ? (
                  <div dangerouslySetInnerHTML={{ __html: post.html }} />
                ) : (
                  <PostText text={post.text} />
                )}
              </div>
              {translated && (
                <p className="auto-translation">
                  {t(showOriginal ? "Original post" : "Translated on this device by PLaMo")}
                  {" · "}
                  <button
                    aria-pressed={showOriginal}
                    onClick={() => setShowOriginal(!showOriginal)}
                  >
                    {t(showOriginal ? "Show translation" : "Show original")}
                  </button>
                </p>
              )}
              {inline && enabledActions.includes(inline.grant) && (
                <p className="post-text border-l-2 pl-3" role="status">
                  {inline.text}
                </p>
              )}
              <PostReadingTools
                post={post}
                saved={saved}
                translation={
                  inline && enabledActions.includes(inline.grant) ? inline.text : translated?.text
                }
              />
              {!!post.media?.length && (
                <div className={`post-media media-${Math.min(2, post.media.length)}`}>
                  {post.media.map((item, i) =>
                    item.type === "photo" ? (
                      <button
                        key={i}
                        aria-label={`Open image${item.alt ? `: ${item.alt}` : ""}`}
                        onClick={() => setMedia(safeUrl(item.url) || null)}
                      >
                        <img
                          src={safeUrl(item.previewUrl || item.url)}
                          alt={item.alt || ""}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      </button>
                    ) : (
                      <video
                        key={i}
                        src={safeUrl(item.url)}
                        poster={safeUrl(item.previewUrl)}
                        controls
                        playsInline
                        preload="none"
                        aria-label={item.alt || t("Post video")}
                      />
                    ),
                  )}
                </div>
              )}
              {post.quotedPost && (
                <button className="quoted-post" onClick={() => onThread(post.quotedPost!)}>
                  <strong>{post.quotedPost.author.name}</strong>
                  <p>{post.quotedPost.text}</p>
                </button>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="error-message mt-3">
              {error}
            </p>
          )}
          <div className="post-actions">
            <button onClick={() => onThread(post)} aria-label={t("Open conversation")}>
              <MessageCircle size={17} />
              <span>{post.replies || ""}</span>
            </button>
            <button
              onClick={() => action("repost")}
              aria-label={post.reposted ? t("Undo repost") : t("Repost")}
              aria-pressed={!!post.reposted}
              disabled={
                post.platform === "nostr" || !!busy || post.readOnly || post.accountId === "guest"
              }
              className={post.reposted ? "reposted" : ""}
            >
              {busy === "repost" ? (
                <LoaderCircle size={17} className="animate-spin" />
              ) : (
                <Repeat2 size={18} />
              )}
              <span>{post.reposts || ""}</span>
            </button>
            <button
              onClick={() => action("like")}
              aria-label={post.liked ? t("Unlike") : t("Like")}
              aria-pressed={!!post.liked}
              disabled={
                post.platform === "nostr" || !!busy || post.readOnly || post.accountId === "guest"
              }
              className={post.liked ? "liked" : ""}
            >
              {busy === "like" ? (
                <LoaderCircle size={17} className="animate-spin" />
              ) : (
                <Heart size={17} fill={post.liked ? "currentColor" : "none"} />
              )}
              <span>{post.likes || ""}</span>
            </button>
            <button
              onClick={() => onSave(post)}
              aria-label={saved ? t("Unsave post") : t("Save post")}
              aria-pressed={saved}
            >
              <Bookmark size={17} fill={saved ? "currentColor" : "none"} />
            </button>
            <a
              href={safeUrl(post.url)}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={t("Open original post")}
            >
              <ExternalLink size={16} />
            </a>
            {postActions
              .filter(
                (action) =>
                  !concealed &&
                  enabledActions.includes(action.grant) &&
                  !(translated && action.permissions?.includes("model.plamo")),
              )
              .map((action) => (
                <button
                  key={action.id}
                  onClick={async () => {
                    if (runningPlugin === action.grant) {
                      job.current?.abort();
                      setRunningPlugin("");
                      return;
                    }
                    job.current?.abort();
                    setRunningPlugin(action.grant);
                    setDownloaded(0);
                    const controller = new AbortController();
                    job.current = controller;
                    try {
                      setError("");
                      const result = await action.run(
                        { post: { text: post.text, url: post.url }, language: auto?.language },
                        controller.signal,
                        setDownloaded,
                      );
                      if (controller.signal.aborted) return;
                      if (result.kind === "inlineText")
                        setInline({ grant: action.grant, text: result.text });
                      else setPluginResult(result.text);
                    } catch (e) {
                      if (controller.signal.aborted) return;
                      setError(errorMessage(e));
                    } finally {
                      if (job.current === controller) setRunningPlugin("");
                    }
                  }}
                >
                  {runningPlugin === action.grant
                    ? t("Cancel") +
                      (downloaded ? " · " + Math.round(downloaded / 1000000) + " / 573 MB" : "")
                    : action.name}
                </button>
              ))}
            {!post.readOnly && post.accountId !== "guest" && (
              <button className="reply-label" onClick={() => onReply(post)}>
                {t("Reply")}
              </button>
            )}
          </div>
        </div>
      </div>
      <Dialog
        open={!!pluginResult}
        onOpenChange={(open) => {
          if (!open) setPluginResult("");
        }}
      >
        <DialogContent>
          <DialogTitle>{t("Plugin output")}</DialogTitle>
          <textarea
            aria-label={t("Plugin output")}
            readOnly
            value={pluginResult}
            onFocus={(e) => e.target.select()}
          />
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(pluginResult);
                setPluginResult("");
              } catch {
                setError(t("Select and copy the text"));
              }
            }}
          >
            {t("Copy")}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!media} onOpenChange={() => setMedia(null)}>
        <DialogContent className="max-w-5xl bg-black p-2 text-white">
          <DialogTitle className="sr-only">{t("Post image")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("Image from")}
            {post.author.name}.
          </DialogDescription>
          {media && (
            <img
              src={media}
              alt={post.media?.find((m) => m.url === media)?.alt || t("Post image")}
              className="max-h-[80dvh] w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </article>
  );
}
