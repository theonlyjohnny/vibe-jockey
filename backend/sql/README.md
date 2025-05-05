# SQL Functions for Semantic DJ

This directory contains SQL functions that need to be applied to your Supabase database.

## match_embeddings_function.sql

This function enables efficient semantic search against song embeddings using pgvector's cosine similarity.

### How to Apply

1. Log in to the Supabase dashboard for your project
2. Navigate to the SQL Editor
3. Create a new query
4. Copy and paste the contents of `match_embeddings_function.sql`
5. Run the query

### Usage in Code

The function is called from the backend via the RPC method:

```python
response = client.rpc(
    "match_embeddings",
    {
        "query_embedding": query_embedding_list,
        "match_threshold": similarity_threshold,
        "match_count": num_results,
    }
).execute()
```

## Troubleshooting

If you encounter errors when running the function:

1. Ensure that pgvector extension is enabled in your Supabase project
2. Verify that the `song_embeddings` table exists and has the correct schema
3. Check that the embedding column is properly defined as `vector(768)` 