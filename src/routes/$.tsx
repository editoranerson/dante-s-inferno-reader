import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { getChapterMeta } from "@/lib/chapterMeta.functions";

const App = lazy(() => import("@/App"));

export const Route = createFileRoute("/$")({
  loader: async ({ params }) => {
    const m = (params._splat ?? "").match(/^biblioteca\/[^/]+\/(.+)$/);
    if (!m) return { chapter: null };
    return { chapter: await getChapterMeta({ data: { slug: decodeURIComponent(m[1]) } }) };
  },
  head: ({ loaderData }) => {
    const ch = loaderData?.chapter;
    if (ch) {
      const img = ch.image && /^https:\/\//.test(ch.image) ? ch.image : null;
      return {
        meta: [
          { title: ch.title },
          { name: "description", content: ch.description },
          { property: "og:title", content: ch.title },
          { property: "og:description", content: ch.description },
          { property: "og:type", content: "article" },
          ...(img ? [{ property: "og:image", content: img }, { name: "twitter:image", content: img }] : []),
          { name: "twitter:card", content: "summary_large_image" },
        ],
      };
    }
    return {
    meta: [
      { title: "Querido Dante — Biblioteca e comunidade" },
      {
        name: "description",
        content:
          "Explore o universo de Querido Dante: biblioteca, chatstories, personagens, segredos, minijogos e muito mais.",
      },
      { property: "og:title", content: "Querido Dante — Biblioteca e comunidade" },
      {
        property: "og:description",
        content:
          "Biblioteca, chatstories, personagens, segredos, minijogos e recompensas no universo de Querido Dante.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    };
  },
  component: CatchAll,
});

function Loader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-grape-400 border-t-transparent" />
    </div>
  );
}

function CatchAll() {
  return (
    <ClientOnly fallback={<Loader />}>
      <Suspense fallback={<Loader />}>
        <App />
      </Suspense>
    </ClientOnly>
  );
}
