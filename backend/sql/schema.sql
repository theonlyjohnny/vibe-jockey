-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the song_embeddings table
CREATE TABLE IF NOT EXISTS song_embeddings (
    id TEXT PRIMARY KEY,
    embedding vector(768),  -- CLAP default dimension
    title TEXT,
    artist TEXT,
    user_id uuid,

    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create the HNSW index for fast similarity search
CREATE INDEX IF NOT EXISTS song_embeddings_hnsw 
ON song_embeddings 
USING hnsw (embedding vector_cosine_ops);

-- Create the match_embeddings function for similarity search
CREATE OR REPLACE FUNCTION match_embeddings(
    query_embedding vector(768),
    match_threshold float,
    match_count int,
    exclude_song_id text DEFAULT NULL
)

RETURNS TABLE (
    id text,
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
        song_embeddings.title,
        song_embeddings.artist,
        1 - (song_embeddings.embedding <=> query_embedding) as similarity
    FROM song_embeddings
    WHERE (exclude_song_id IS NULL OR song_embeddings.id != exclude_song_id)
        AND 1 - (song_embeddings.embedding <=> query_embedding) > match_threshold
    ORDER BY song_embeddings.embedding <=> query_embedding
    LIMIT match_count;
END;
$$; 