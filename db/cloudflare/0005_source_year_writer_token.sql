-- Give each annual snapshot write attempt a unique owner token. The token is
-- only a CAS guard; it is separate from retrieval time and source revision.
ALTER TABLE sync_runs ADD COLUMN source_year_writer_token TEXT;
