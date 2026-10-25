import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { readGuestPhoto } from "@/lib/guest/gallery.functions";

/** No bearer storage URLs: each image read rechecks membership and moderation. */
export function GuestPhoto({
  id,
  alt,
  className,
  style,
  eager = false,
}: {
  id: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  eager?: boolean;
}) {
  const container = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(eager);
  const read = useServerFn(readGuestPhoto);
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (eager || !container.current) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "300px",
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [eager]);
  const image = useQuery({
    queryKey: ["guest-photo", id, eager],
    queryFn: async () => {
      const response = await read({ data: { photoId: id, thumbnail: !eager } });
      if (!response.ok) throw new Error("Photo unavailable");
      return response.blob();
    },
    enabled: visible,
    gcTime: 0,
    staleTime: 0,

    retry: 1,
  });
  useEffect(() => {
    if (!image.data || image.isError) {
      setUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(image.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image.data, image.isError]);
  return (
    <span ref={container} className={className} style={{ display: "block", ...style }}>
      {!image.isError && url ? (
        <img src={url} alt={alt} className="h-full w-full object-contain" />
      ) : (
        <span
          className="flex h-full min-h-32 items-center justify-center p-4 text-center text-xs text-muted-foreground"
          role="status"
        >
          {image.isError ? "Photo unavailable" : "Loading photo…"}
        </span>
      )}
    </span>
  );
}
