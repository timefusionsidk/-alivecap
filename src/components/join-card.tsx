import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { publicJoinUrl } from "@/lib/public-url";

export function JoinCard({ slug }: { slug: string }) {
  const [qr, setQr] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setError(false);
    try {
      const link = publicJoinUrl(slug);
      setUrl(link);
      void QRCode.toDataURL(link, {
        width: 512,
        margin: 3,
        color: { dark: "#0f0e0c", light: "#f3ece4" },
      })
        .then((image) => {
          if (active) setQr(image);
        })
        .catch(() => {
          if (active) setError(true);
        });
    } catch {
      setError(true);
    }
    return () => {
      active = false;
    };
  }, [slug]);
  return (
    <aside className="join-card">
      <h2>How guests join</h2>
      <p>One scan. Every perspective.</p>
      {qr ? (
        <img src={qr} width="512" height="512" alt="Scan to join this event" />
      ) : (
        <p role="status">
          {error ? "QR unavailable. Check your public URL configuration." : "Preparing your QR…"}
        </p>
      )}
      <p>Guests scan to join and start shooting.</p>
      <div className="join-link">
        <code>{url}</code>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Copy join link"
          disabled={!url}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              toast.success("Join link copied");
            } catch {
              toast.error("Could not copy. Select and copy the link instead.");
            }
          }}
        >
          <Copy />
        </Button>
      </div>
      {qr && (
        <Button type="button" variant="outline" asChild>
          <a href={qr} download={`alivecap-${slug}-qr.png`}>
            <Download /> Download QR
          </a>
        </Button>
      )}
    </aside>
  );
}
