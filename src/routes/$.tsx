import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { getChapterMeta } from "@/lib/chapterMeta.functions";

const App = lazy(() => import("@/App"));

const DEFAULT_IMAGE = "https://queridodante.lovable.app/og-preview.jpg";

export const Route = createFileRoute("/$")({
  loader: async ({ params }) => {
    const m = (params._splat ?? "").match(/^biblioteca\/[^/]+\/(.+)$/);
    if (!m) return { chapter: null };
    return { chapter: await getChapterMeta({ data: { slug: decodeURIComponent(m[1]) } }) };
  },
  head: ({ loaderData }) => {
    const ch = loaderData?.chapter;
    if (ch) {
      const img = ch.image ?? DEFAULT_IMAGE;
      return {
        meta: [
          { title: ch.title },
          { name: "description", content: ch.description },
          { property: "og:title", content: ch.title },
          { property: "og:description", content: ch.description },
          { property: "og:type", content: "article" },
          { property: "og:image", content: img },
          { name: "twitter:card", content: "summary_large_image" },
          { name: "twitter:image", content: img },
        ],
      };
    }
    return {
    meta: [
      { title: "Querido Dante — O universo interativo do Dante" },
      {
        name: "description",
        content:
          "Explore o universo de Querido Dante: biblioteca, chatstories, personagens, segredos, minijogos e muito mais.",
      },
      { property: "og:title", content: "Querido Dante — O universo interativo do Dante" },
      {
        property: "og:description",
        content:
          "Biblioteca, chatstories, personagens, segredos, minijogos e recompensas no universo de Querido Dante.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://queridodante.lovable.app/og-preview.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://queridodante.lovable.app/og-preview.jpg" },
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
