CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id text,
  preview_url text,
  title text,
  artist text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    song_embeddings.id,
    song_embeddings.preview_url,
    song_embeddings.title,
    song_embeddings.artist,
    1 - (song_embeddings.embedding <=> query_embedding) as similarity
  FROM song_embeddings
  WHERE 1 - (song_embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY song_embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$; 