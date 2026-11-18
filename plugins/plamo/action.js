export default function translate({post}) {
  if (!post.text.trim()) throw new Error("Empty post");
  return {kind:"translate",text:post.text};
}
