import type { SocialPost } from "../../src/domain/model";
// Adapter output before attaching the viewing account.
export type ResearchPost = Omit<SocialPost, "accountId" | "quotedPost"> & {
  quotedPost?: ResearchPost;
};
