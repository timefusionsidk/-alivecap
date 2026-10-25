import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarDays, Plus, Camera, Images, Settings2, UserRound } from "lucide-react";
import { Brand } from "@/components/brand";

export function MobileNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const id = path.match(/^\/events\/([^/]+)/)?.[1];
  const eventId = id && id !== "new" ? id : undefined;
  const items = eventId
    ? [
        { to: "/dashboard", label: "Events", icon: CalendarDays },
        { to: `/events/${eventId}/photos`, label: "Gallery", icon: Images },
        { to: "/camera-check", label: "Camera", icon: Camera },
        { to: `/events/${eventId}/settings`, label: "Settings", icon: Settings2 },
      ]
    : [
        { to: "/dashboard", label: "Events", icon: CalendarDays },
        { to: "/events/new", label: "Create", icon: Plus },
        { to: "/camera-check", label: "Camera", icon: Camera },
      ];
  return (
    <nav aria-label="Main" className="app-nav">
      <Link to="/dashboard" className="nav-brand" title="AliveCap events">
        <Brand variant="icon" />
      </Link>
      <ul>
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              title={label}
              aria-current={path === to ? "page" : undefined}
              className="nav-item"
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        to="/dashboard"
        hash="account"
        className="nav-account nav-item"
        title="Account and sign out"
      >
        <UserRound aria-hidden="true" />
        <span>Account</span>
      </Link>
    </nav>
  );
}
