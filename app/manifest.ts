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
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  }
}
