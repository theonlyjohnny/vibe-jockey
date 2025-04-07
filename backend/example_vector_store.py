from sentence_transformers import SentenceTransformer
import numpy as np
from vector_store import SupabaseVectorStore
from typing import List
import time

def get_embeddings(texts: List[str], model_name: str = "all-MiniLM-L6-v2") -> np.ndarray:
    """Generate embeddings for a list of texts using sentence-transformers."""
    model = SentenceTransformer(model_name)
    embeddings = model.encode(texts, convert_to_tensor=False)
    return embeddings

def main():
    # Initialize the vector store
    vector_store = SupabaseVectorStore(
        table_name="song_embeddings",
        embedding_column="embedding",
        content_column="lyrics",
        metadata_columns=["title", "artist", "genre"]
    )
    
    # Example song lyrics and metadata
    songs = [
        {
            "lyrics": "I've been running through the jungle, I've been running with the wolves",
            "title": "Wolves",
            "artist": "Selena Gomez",
            "genre": "Pop"
        },
        {
            "lyrics": "Ground Control to Major Tom, Take your protein pills and put your helmet on",
            "title": "Space Oddity",
            "artist": "David Bowie",
            "genre": "Rock"
        },
        {
            "lyrics": "I've got sunshine on a cloudy day. When it's cold outside I've got the month of May",
            "title": "My Girl",
            "artist": "The Temptations",
            "genre": "Soul"
        }
    ]
    
    # Extract lyrics and generate embeddings
    lyrics = [song["lyrics"] for song in songs]
    print("Generating embeddings...")
    embeddings = get_embeddings(lyrics)
    
    # Prepare metadata
    metadata = [
        {"title": song["title"], "artist": song["artist"], "genre": song["genre"]}
        for song in songs
    ]
    
    # Store embeddings
    print("Storing embeddings in Supabase...")
    vector_store.add_embeddings(embeddings, lyrics, metadata)
    print("Embeddings stored successfully!")
    
    # Wait a moment for the database to process
    time.sleep(1)
    
    # Example search query
    search_text = "space travel astronaut cosmic"
    print(f"\nSearching for songs similar to: '{search_text}'")
    
    # Generate embedding for search query
    query_embedding = get_embeddings([search_text])[0]  # Get first embedding since we only have one query
    
    # Search for similar songs
    results = vector_store.search_similar(
        query_embedding,
        num_results=2,
        similarity_threshold=0.1
    )
    
    print("\nSearch results:")
    for i, result in enumerate(results, 1):
        print(f"\n{i}. Title: {result.get('title')}")
        print(f"   Artist: {result.get('artist')}")
        print(f"   Genre: {result.get('genre')}")
        print(f"   Lyrics: {result.get('lyrics')}")
        print(f"   Similarity: {result.get('similarity'):.3f}")

if __name__ == "__main__":
    main() 