import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  Dialog,
  Empty,
  ImageViewer,
  InfiniteScroll,
  TextArea,
  Toast,
} from "antd-mobile";
import { AddOutline, DeleteOutline, HeartFill, HeartOutline, MessageOutline } from "antd-mobile-icons";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  addComment,
  deleteComment,
  deleteMoment,
  listMoments,
  momentImageUrl,
  toggleLike,
  type MomentComment,
  type MomentPost,
} from "../api/moments";
import MomentEditorPopup from "../components/MomentEditorPopup";
import { MemberAvatarLink, MemberNameLink } from "../components/MemberProfileLink";
import { PageShell, colors, sectionCardStyle } from "../components/ui";
import { useAuth } from "../hooks/useAuth";

const PAGE_SIZE = 20;

const formatRelativeTime = (value: string): string => {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} 分钟前`;
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))} 小时前`;
  if (diff < 7 * day) return `${Math.max(1, Math.floor(diff / day))} 天前`;
  const month = date.getMonth() + 1;
  const dayOfMonth = date.getDate();
  const hh = `${date.getHours()}`.padStart(2, "0");
  const mm = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}-${dayOfMonth} ${hh}:${mm}`;
};

const contentLikelyLong = (text?: string) => {
  if (!text) return false;
  const lines = text.split("\n");
  return lines.length > 5 || text.length > 140;
};

const buildOptimisticComment = (postId: number, content: string, me: NonNullable<ReturnType<typeof useAuth>["me"]>): MomentComment => ({
  id: -Date.now(),
  post_id: postId,
  author: {
    open_id: me.open_id,
    name: me.name,
    avatar_url: me.avatar_url,
    title: me.title || undefined,
    position: me.department || undefined,
  },
  content,
  created_at: new Date().toISOString(),
});

const isPostDeletable = (post: MomentPost, viewerOpenId?: string | null, role?: string) =>
  post.author.open_id === viewerOpenId || role === "admin";

const isCommentDeletable = (comment: MomentComment, viewerOpenId?: string | null, role?: string) =>
  comment.author.open_id === viewerOpenId || role === "admin";

const MomentsPage = () => {
  const { me, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const authorOpenId = searchParams.get("author") || undefined;
  const [items, setItems] = useState<MomentPost[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(0);
  const [initialized, setInitialized] = useState(false);
  const [popupVisible, setPopupVisible] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [expandedPosts, setExpandedPosts] = useState<Record<number, boolean>>({});
  const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [commentSubmitting, setCommentSubmitting] = useState<Record<number, boolean>>({});
  const activeAuthorNameRef = useRef<string>("");

  const authorLabel = useMemo(() => {
    if (!authorOpenId) {
      return "";
    }
    const first = items[0];
    if (first?.author.open_id === authorOpenId) {
      activeAuthorNameRef.current = first.author.name;
    }
    return activeAuthorNameRef.current || "该成员";
  }, [authorOpenId, items]);

  const resetFeed = () => {
    setItems([]);
    setNextCursor(0);
    setInitialized(false);
    setExpandedPosts({});
    setExpandedComments({});
    setCommentDrafts({});
    activeAuthorNameRef.current = "";
  };

  useEffect(() => {
    resetFeed();
  }, [authorOpenId]);

  useEffect(() => {
    const handleRefresh = (event: Event) => {
      const post = (event as CustomEvent<MomentPost | undefined>).detail;
      if (!post) {
        resetFeed();
        return;
      }
      if (authorOpenId && post.author.open_id !== authorOpenId) {
        return;
      }
      setItems((prev) => [post, ...prev.filter((item) => item.id !== post.id)]);
    };
    window.addEventListener("moments:refresh", handleRefresh);
    return () => window.removeEventListener("moments:refresh", handleRefresh);
  }, [authorOpenId]);

  if (loading) {
    return <PageShell><div style={{ color: colors.muted, fontSize: 13 }}>正在加载动态...</div></PageShell>;
  }
  if (!me) {
    return <Navigate to="/login" replace />;
  }

  const loadMore = async () => {
    const cursor = nextCursor === 0 ? null : nextCursor;
    const response = await listMoments(cursor, PAGE_SIZE, authorOpenId);
    setItems((prev) => {
      const seen = new Set(prev.map((item) => item.id));
      const appended = response.items.filter((item) => !seen.has(item.id));
      return prev.concat(appended);
    });
    setNextCursor(response.next_cursor);
    setInitialized(true);
  };

  const updatePost = (postId: number, updater: (post: MomentPost) => MomentPost) => {
    setItems((prev) => prev.map((post) => (post.id === postId ? updater(post) : post)));
  };

  const handleLike = async (post: MomentPost) => {
    const prevLiked = post.i_liked;
    const prevCount = post.likes_count;
    updatePost(post.id, (current) => ({
      ...current,
      i_liked: !current.i_liked,
      likes_count: Math.max(0, current.likes_count + (current.i_liked ? -1 : 1)),
    }));
    try {
      const result = await toggleLike(post.id);
      updatePost(post.id, (current) => ({ ...current, i_liked: result.liked, likes_count: result.likes_count }));
    } catch (error) {
      console.error(error);
      updatePost(post.id, (current) => ({ ...current, i_liked: prevLiked, likes_count: prevCount }));
      Toast.show({ icon: "fail", content: "点赞失败" });
    }
  };

  const handleDeletePost = async (post: MomentPost) => {
    const confirmed = await Dialog.confirm({
      content: "删除后不可恢复，确认删除这条动态吗？",
      confirmText: "删除",
      cancelText: "取消",
    });
    if (!confirmed) {
      return;
    }
    const snapshot = items;
    setItems((prev) => prev.filter((item) => item.id !== post.id));
    try {
      await deleteMoment(post.id);
      Toast.show({ icon: "success", content: "已删除" });
    } catch (error) {
      console.error(error);
      setItems(snapshot);
      Toast.show({ icon: "fail", content: "删除失败" });
    }
  };

  const handleSubmitComment = async (post: MomentPost) => {
    const content = (commentDrafts[post.id] || "").trim();
    if (!content) {
      Toast.show({ icon: "fail", content: "请输入评论内容" });
      return;
    }
    const optimistic = buildOptimisticComment(post.id, content, me);
    setCommentDrafts((prev) => ({ ...prev, [post.id]: "" }));
    setCommentSubmitting((prev) => ({ ...prev, [post.id]: true }));
    updatePost(post.id, (current) => ({
      ...current,
      comments_count: current.comments_count + 1,
      recent_comments: [...current.recent_comments, optimistic].slice(0, 20),
    }));
    setExpandedComments((prev) => ({ ...prev, [post.id]: true }));
    try {
      const created = await addComment(post.id, content);
      updatePost(post.id, (current) => ({
        ...current,
        recent_comments: current.recent_comments.map((comment) => (comment.id === optimistic.id ? created : comment)),
      }));
    } catch (error) {
      console.error(error);
      setCommentDrafts((prev) => ({ ...prev, [post.id]: content }));
      updatePost(post.id, (current) => ({
        ...current,
        comments_count: Math.max(0, current.comments_count - 1),
        recent_comments: current.recent_comments.filter((comment) => comment.id !== optimistic.id),
      }));
      Toast.show({ icon: "fail", content: "评论失败" });
    } finally {
      setCommentSubmitting((prev) => ({ ...prev, [post.id]: false }));
    }
  };

  const handleDeleteComment = async (post: MomentPost, comment: MomentComment) => {
    const previousComments = post.recent_comments;
    const previousCount = post.comments_count;
    updatePost(post.id, (current) => ({
      ...current,
      comments_count: Math.max(0, current.comments_count - 1),
      recent_comments: current.recent_comments.filter((item) => item.id !== comment.id),
    }));
    try {
      await deleteComment(post.id, comment.id);
      Toast.show({ icon: "success", content: "评论已删除" });
    } catch (error) {
      console.error(error);
      updatePost(post.id, (current) => ({
        ...current,
        comments_count: previousCount,
        recent_comments: previousComments,
      }));
      Toast.show({ icon: "fail", content: "删除评论失败" });
    }
  };

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 5,
            margin: "-16px -16px 0",
            padding: "14px 16px 10px",
            background: "rgba(244,247,251,0.94)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid rgba(229,231,235,0.82)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ color: colors.title, fontSize: 21, fontWeight: 800 }}>朋友圈</div>
              <div style={{ marginTop: 4, color: colors.muted, fontSize: 12 }}>实验室近况、现场照片与即时交流</div>
            </div>
            <Button
              color="primary"
              size="small"
              onClick={() => setPopupVisible(true)}
              style={{ "--border-radius": "999px" } as CSSProperties}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <AddOutline />
                发布
              </span>
            </Button>
          </div>
          {authorOpenId ? (
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                borderRadius: 12,
                background: "#ffffff",
                border: "1px solid rgba(226,232,240,0.88)",
                padding: "10px 12px",
              }}
            >
              <div style={{ color: colors.body, fontSize: 13 }}>查看 {authorLabel} 的动态</div>
              <button
                type="button"
                onClick={() => navigate("/moments")}
                style={{ border: "none", background: "transparent", color: colors.primaryDeep, fontWeight: 700, cursor: "pointer" }}
              >
                返回全部
              </button>
            </div>
          ) : null}
        </div>

        {initialized && items.length === 0 ? (
          <Card style={sectionCardStyle}>
            <Empty description="还没人发动态, 快来抢沙发" />
          </Card>
        ) : null}

        {items.map((post) => {
          const commentsExpanded = expandedComments[post.id];
          const commentsToShow = commentsExpanded ? post.recent_comments : post.recent_comments.slice(0, 3);
          const hasLongContent = contentLikelyLong(post.content);
          const contentExpanded = expandedPosts[post.id];
          const imageUrls = post.images.map((image) => momentImageUrl(image.file_token));

          return (
            <Card key={post.id} style={sectionCardStyle}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <MemberAvatarLink
                    openId={post.author.open_id}
                    viewerOpenId={me.open_id}
                    src={post.author.avatar_url}
                    name={post.author.name}
                    size={42}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <MemberNameLink
                        openId={post.author.open_id}
                        viewerOpenId={me.open_id}
                        style={{ color: colors.title, fontSize: 15, fontWeight: 800 }}
                      >
                        {post.author.name}
                      </MemberNameLink>
                      {post.author.position ? (
                        <span style={{ padding: "3px 8px", borderRadius: 999, background: "#e0f2fe", color: "#075985", fontSize: 11, fontWeight: 700 }}>
                          {post.author.position}
                        </span>
                      ) : null}
                      {post.author.title ? (
                        <span style={{ padding: "3px 8px", borderRadius: 999, background: "#ede9fe", color: "#5b21b6", fontSize: 11, fontWeight: 700 }}>
                          {post.author.title}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ marginTop: 5, color: colors.muted, fontSize: 12 }}>{formatRelativeTime(post.created_at)}</div>
                  </div>
                  {isPostDeletable(post, me.open_id, me.role) ? (
                    <button
                      type="button"
                      onClick={() => void handleDeletePost(post)}
                      style={{ border: "none", background: "transparent", color: colors.placeholder, cursor: "pointer", padding: 0 }}
                    >
                      <DeleteOutline fontSize={18} />
                    </button>
                  ) : null}
                </div>

                {post.content ? (
                  <div>
                    <div
                      style={{
                        color: colors.body,
                        fontSize: 14,
                        lineHeight: 1.75,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        display: "-webkit-box",
                        WebkitBoxOrient: "vertical",
                        WebkitLineClamp: contentExpanded || !hasLongContent ? "unset" : 5,
                        overflow: "hidden",
                      }}
                    >
                      {post.content}
                    </div>
                    {hasLongContent ? (
                      <button
                        type="button"
                        onClick={() => setExpandedPosts((prev) => ({ ...prev, [post.id]: !prev[post.id] }))}
                        style={{ marginTop: 6, border: "none", background: "transparent", color: colors.primaryDeep, fontSize: 13, fontWeight: 700, padding: 0, cursor: "pointer" }}
                      >
                        {contentExpanded ? "收起" : "展开"}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {imageUrls.length > 0 ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: imageUrls.length === 1 ? "1fr" : imageUrls.length === 2 ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
                      gap: 8,
                    }}
                  >
                    {imageUrls.map((url, index) => (
                      <button
                        key={post.images[index].file_token}
                        type="button"
                        onClick={() => {
                          setViewerImages(imageUrls);
                          setViewerIndex(index);
                          setViewerVisible(true);
                        }}
                        style={{
                          padding: 0,
                          border: "1px solid rgba(226,232,240,0.88)",
                          borderRadius: 12,
                          overflow: "hidden",
                          background: "#e2e8f0",
                          aspectRatio: imageUrls.length === 1 ? "16 / 11" : imageUrls.length === 2 ? "1 / 1.1" : "1 / 1",
                          cursor: "pointer",
                        }}
                      >
                        <img src={url} alt={post.images[index].name || "动态图片"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </button>
                    ))}
                  </div>
                ) : null}

                <div style={{ display: "flex", alignItems: "center", gap: 18, color: colors.muted }}>
                  <button
                    type="button"
                    onClick={() => void handleLike(post)}
                    style={{
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      color: post.i_liked ? "#dc2626" : colors.muted,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {post.i_liked ? <HeartFill fontSize={18} /> : <HeartOutline fontSize={18} />}
                    {post.likes_count}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const target = document.getElementById(`moment-comment-input-${post.id}`);
                      target?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      color: colors.muted,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    <MessageOutline fontSize={18} />
                    {post.comments_count}
                  </button>
                </div>

                {post.recent_comments.length > 0 ? (
                  <div
                    style={{
                      borderRadius: 12,
                      background: "#f8fafc",
                      border: "1px solid rgba(226,232,240,0.8)",
                      padding: "10px 12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {commentsToShow.map((comment) => (
                      <div key={comment.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <div style={{ flex: 1, minWidth: 0, color: colors.body, fontSize: 13, lineHeight: 1.65 }}>
                          <span style={{ fontWeight: 700, color: colors.title }}>{comment.author.name}</span>
                          <span style={{ color: colors.muted }}> · {formatRelativeTime(comment.created_at)}</span>
                          <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{comment.content}</div>
                        </div>
                        {isCommentDeletable(comment, me.open_id, me.role) ? (
                          <button
                            type="button"
                            onClick={() => void handleDeleteComment(post, comment)}
                            style={{ border: "none", background: "transparent", color: colors.placeholder, padding: 0, cursor: "pointer" }}
                          >
                            <DeleteOutline fontSize={16} />
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {post.comments_count > 3 && !commentsExpanded ? (
                      <button
                        type="button"
                        onClick={() => setExpandedComments((prev) => ({ ...prev, [post.id]: true }))}
                        style={{ border: "none", background: "transparent", color: colors.primaryDeep, fontSize: 13, fontWeight: 700, padding: 0, textAlign: "left", cursor: "pointer" }}
                      >
                        查看全部 {post.comments_count} 条评论
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div
                  id={`moment-comment-input-${post.id}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 10,
                    alignItems: "end",
                  }}
                >
                  <div
                    style={{
                      borderRadius: 12,
                      background: "#f8fafc",
                      border: "1px solid rgba(226,232,240,0.88)",
                      padding: "4px 10px",
                    }}
                  >
                    <TextArea
                      value={commentDrafts[post.id] || ""}
                      onChange={(value) => setCommentDrafts((prev) => ({ ...prev, [post.id]: value }))}
                      placeholder="写评论..."
                      autoSize={{ minRows: 1, maxRows: 4 }}
                      maxLength={500}
                    />
                  </div>
                  <Button
                    color="primary"
                    size="small"
                    loading={Boolean(commentSubmitting[post.id])}
                    onClick={() => void handleSubmitComment(post)}
                    style={{ "--border-radius": "999px" } as CSSProperties}
                  >
                    发送
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}

        {initialized && items.length > 0 ? (
          <InfiniteScroll loadMore={loadMore} hasMore={nextCursor !== null} />
        ) : null}
        {!initialized ? <InfiniteScroll loadMore={loadMore} hasMore /> : null}
      </div>

      <MomentEditorPopup
        visible={popupVisible}
        onClose={() => setPopupVisible(false)}
        onSuccess={(post) => {
          setItems((prev) => [post, ...prev.filter((item) => item.id !== post.id)]);
        }}
      />

      <ImageViewer.Multi
        images={viewerImages}
        visible={viewerVisible}
        defaultIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />
    </PageShell>
  );
};

export default MomentsPage;
