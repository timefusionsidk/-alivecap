-- New-project private buckets. This migration is idempotent and does not touch files.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
 ('photos', 'photos', false, 15728640, ARRAY['image/jpeg','image/png','image/webp']),
 ('thumbnails', 'thumbnails', false, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
 ('covers', 'covers', false, 8388608, ARRAY['image/jpeg','image/png','image/webp']),
 ('exports', 'exports', false, 52428800, ARRAY['application/zip']),
 ('avatars', 'avatars', false, 2097152, ARRAY['image/jpeg','image/png','image/webp']),
 ('videos', 'videos', false, 209715200, ARRAY['video/mp4','video/webm']),
 ('temporary', 'temporary', false, 15728640, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;
