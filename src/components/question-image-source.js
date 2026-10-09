import { supabase } from "../lib/supabase.js";
import { createQuestionImageCache } from "./question-image-cache.js";
const preloaded = new Map();
let preloadOwner;
let accountEpoch = 0;
let account;
const cache = createQuestionImageCache(async (src, owner) => {
  if (account !== undefined && account !== owner)
    throw new Error("Account changed while loading the image. Retry.");
  const epoch = accountEpoch;
  const packageAsset = src.includes(
    "/storage/v1/object/authenticated/book-package-assets/",
  );
  const bucket = packageAsset ? "book-package-assets" : "question-assets";
  const marker = `/storage/v1/object/authenticated/${bucket}/`;
  if (!src.includes(marker)) return src;
  const path = src.split(marker)[1];
  if (
    !(
      packageAsset
        ? /^[a-f0-9]{64}\/[a-f0-9]{64}\.(?:png|jpe?g)$/
        : /^[a-f0-9]{64}\/[a-f0-9]{64}\.webp$/
    ).test(path)
  )
    throw new Error("Invalid asset");
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600);
  if (error) throw error;
  if (epoch !== accountEpoch)
    throw new Error("Account changed while loading the image. Retry.");
  return data.signedUrl;
});
// Discard resident and in-flight capabilities on logout/account changes, even
// if the same account signs in again before a pending signing request returns.
const authSubscription = supabase?.auth.onAuthStateChange((_event, session) => {
  const next = session?.user?.id ?? null;
  if (account !== undefined && account !== next) {
    accountEpoch++;
    cache.clear();
    preloaded.clear();
    preloadOwner = undefined;
  }
  account = next;
});
if (import.meta.hot)
  import.meta.hot.dispose(() =>
    authSubscription?.data.subscription.unsubscribe(),
  );
export const resolveQuestionImage = (src, owner) => cache.get(owner, src);
export const invalidateQuestionImage = (src, owner) =>
  cache.invalidate(owner, src);
// Warm only the immediately following question (at most one reference and four
// choices), with the same owner-scoped cache. Failed preloads never block Check.
export function preloadQuestionImages(question, owner) {
  if (preloadOwner !== owner) {
    preloaded.clear();
    preloadOwner = owner;
  }
  const sources = [
    question.image_url,
    ...(question.option_image_urls || []).slice(0, 4),
  ].filter(Boolean);
  for (const src of new Set(sources)) {
    resolveQuestionImage(src, owner)
      .then((url) => {
        if (preloadOwner !== owner || preloaded.has(url)) return;
        while (preloaded.size >= 10)
          preloaded.delete(preloaded.keys().next().value);
        const image = new Image();
        preloaded.set(url, image);
        image.onerror = () => preloaded.delete(url);
        image.src = url;
      })
      .catch(() => {});
  }
}
