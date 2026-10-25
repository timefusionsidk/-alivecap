ALTER TABLE public.events ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.exports ALTER COLUMN requested_by DROP NOT NULL;