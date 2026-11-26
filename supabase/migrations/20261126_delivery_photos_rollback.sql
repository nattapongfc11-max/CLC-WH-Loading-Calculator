-- Rollback of 20261126_delivery_photos.sql (photo files in R2 are NOT deleted – purge the bucket separately)
drop table if exists public.delivery_photos;
