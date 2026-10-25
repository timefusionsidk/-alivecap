import { Link } from "@tanstack/react-router";
import { Camera, Images } from "lucide-react";
import { Brand } from "@/components/brand";

export function GuestNav({ slug, screen }: { slug: string; screen: "camera" | "gallery" }) {
  return (
    <nav
      className="app-nav guest-nav"
      data-camera={screen === "camera"}
      aria-label="Event navigation"
    >
      <Link to="/e/$slug/gallery" params={{ slug }} className="nav-brand" title="Event gallery">
        <Brand variant="icon" />
      </Link>
      <ul>
        <li>
          <Link
            to="/e/$slug/gallery"
            params={{ slug }}
            className="nav-item"
            aria-current={screen === "gallery" ? "page" : undefined}
          >
            <Images />
            <span>Gallery</span>
          </Link>
        </li>
        <li>
          <Link
            to="/e/$slug/camera"
            params={{ slug }}
            className="nav-item"
            aria-current={screen === "camera" ? "page" : undefined}
          >
            <Camera />
            <span>Camera</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
