import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "EISAX Studio — Word & Slides Office",
    short_name: "EISAX Studio",
    description:
      "Lightweight Office suite with continuous WYSIWYG Word processor, interactive 16:9 slide editor, Arabic RTL support, and native .docx/.pptx compatibility.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "fullscreen"],
    orientation: "any",
    background_color: "#060b14",
    theme_color: "#060b14",
    categories: ["productivity", "business", "office"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
