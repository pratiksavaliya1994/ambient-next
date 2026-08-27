import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ambient Flooring",
    short_name: "Ambient",
    description: "Tool request and pickup workflow for Ambient Flooring",
    start_url: "/",
    display: "standalone",
    background_color: "#17181a",
    theme_color: "#f0c14b",
    icons: [
      // The SVG is resolution-independent, so it satisfies every size Chrome
      // looks for (it wants one >= 192px) without shipping a second raster.
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Android crops to its own mask; the icon is a full-bleed rounded square
      // with a centred mark, so it survives the crop.
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
