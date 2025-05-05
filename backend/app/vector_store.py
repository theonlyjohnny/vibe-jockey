from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from supabase import create_client
from dotenv import load_dotenv
import os
import logging
from supabase.lib.client_options import ClientOptions
import json
from .models import SongMetadata

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SupabaseConnectionError(Exception):
    """Custom exception for Supabase connection issues."""
    pass

class SupabaseVectorStore:
    def __init__(
        self,
        id: Optional[str] = None,
        table_name: str = "song_embeddings",
        embedding_column: str = "embedding",
        content_column: str = "content",
        metadata_columns: Optional[List] = None,
    ):
        """Initialize the Supabase Vector Store.
        
        Args:
            id (str, optional): Optional ID for the record
            table_name (str): Name of the table to store vectors
            embedding_column (str): Name of the column containing the vector embeddings
            content_column (str): Name of the column containing the text content
            metadata_columns (List, optional): Additional metadata columns to store/retrieve
            
        Raises:
            ValueError: If required environment variables are missing
            SupabaseConnectionError: If connection to Supabase fails
        """
        load_dotenv()
        
        # Set instance variables first
        self.id = id
        self.table_name = table_name
        self.embedding_column = embedding_column
        self.content_column = content_column
        self.metadata_columns = metadata_columns or []
        
        # Then initialize Supabase connection
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        
        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in environment variables")
        
        try:
            # Configure client with timeout and retries
            options = ClientOptions(
                postgrest_client_timeout=10,  # 10 second timeout
                storage_client_timeout=30,    # 30 second timeout for storage
            )
            self.client = create_client(supabase_url, supabase_key, options=options)
            
            # Test connection by making a simple query
            self._test_connection()
            
            logger.info(f"Successfully connected to Supabase and verified table '{self.table_name}'")
        except Exception as e:
            error_msg = f"Failed to initialize Supabase client: {str(e)}"
            logger.error(error_msg)
            raise SupabaseConnectionError(error_msg) from e
        
    def _test_connection(self) -> None:
        """Test the Supabase connection and table access.
        
        Raises:
            SupabaseConnectionError: If connection test fails
        """
        try:
            # Try to fetch a single row to verify table exists and is accessible
            self.client.table(self.table_name).select("*").limit(1).execute()
        except Exception as e:
            error_msg = f"Failed to verify table '{self.table_name}': {str(e)}"
            logger.error(error_msg)
            raise SupabaseConnectionError(error_msg) from e
        
    def add_embeddings(
        self,
        embeddings: List[np.ndarray],
        contents: List[str],
        metadata: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        """Add embeddings to the vector store.
        
        Args:
            embeddings (List[np.ndarray]): List of embedding vectors
            contents (List[str]): List of text contents corresponding to embeddings
            metadata (List[Dict[str, Any]], optional): List of metadata dicts for each embedding
            
        Raises:
            ValueError: If input validation fails
            SupabaseConnectionError: If Supabase operation fails
        """
        # Input validation
        if not embeddings:
            raise ValueError("Embeddings list cannot be empty")
            
        if len(embeddings) != len(contents):
            raise ValueError(f"Number of embeddings ({len(embeddings)}) must match number of contents ({len(contents)})")
            
        if metadata and len(metadata) != len(embeddings):
            raise ValueError(f"Number of metadata items ({len(metadata)}) must match number of embeddings ({len(embeddings)})")
            
        records = []
        try:
            for i, (embedding, content) in enumerate(zip(embeddings, contents)):
                # Validate embedding shape and content
                if not isinstance(embedding, np.ndarray):
                    raise ValueError(f"Embedding at index {i} is not a numpy array")
                    
                if not content or not isinstance(content, str):
                    raise ValueError(f"Invalid content at index {i}")
                
                # Use provided ID or create one from metadata if available
                track_id = self.id
                if not track_id and metadata and metadata[i]:
                    title = metadata[i].get('title', '').lower()
                    artist = metadata[i].get('artist', '').lower()
                    if title and artist:
                        # Replace spaces and special chars with underscores
                        title = ''.join(c if c.isalnum() else '_' for c in title)
                        artist = ''.join(c if c.isalnum() else '_' for c in artist)
                        track_id = f"{artist}_{title}"
                        # Remove consecutive underscores
                        track_id = '_'.join(filter(None, track_id.split('_')))
                        # Add id to metadata for consistency
                        metadata[i]['id'] = track_id
                
                record = {
                    'id': track_id,
                    self.embedding_column: embedding.tolist(),
                    self.content_column: content,
                }
                
                if metadata:
                    for key, value in metadata[i].items():
                        record[key] = value
                            
                records.append(record)
                
            # Log the operation details
            logger.info(f"Attempting to insert {len(records)} records into {self.table_name}")
            
            try:
                response = self.client.table(self.table_name).insert(records).execute()
                
                # Check response for errors
                if hasattr(response, 'error') and response.error:
                    error_msg = f"Supabase insert failed: {json.dumps(response.error)}"
                    logger.error(error_msg)
                    raise SupabaseConnectionError(error_msg)
                    
                logger.info(f"Successfully inserted {len(records)} records")
                
            except Exception as e:
                error_msg = f"Failed to insert records: {str(e)}"
                logger.error(error_msg)
                raise SupabaseConnectionError(error_msg) from e
                
        except Exception as e:
            error_msg = f"Error preparing records for insertion: {str(e)}"
            logger.error(error_msg)
            raise
            
    def search_similar(
        self,
        query_embedding: np.ndarray,
        num_results: int = 5,
        similarity_threshold: float = 0.0,
    ) -> List[Dict[str, Any]]:
        """Search for similar vectors using cosine similarity.
        
        Args:
            query_embedding (np.ndarray): Query vector to find similar embeddings
            num_results (int): Number of results to return
            similarity_threshold (float): Minimum similarity threshold (0 to 1)
            
        Returns:
            List[Dict[str, Any]]: List of similar items with their content and metadata
            
        Raises:
            ValueError: If input validation fails
            SupabaseConnectionError: If Supabase operation fails
        """
        # Input validation
        if not isinstance(query_embedding, np.ndarray):
            raise ValueError("query_embedding must be a numpy array")
            
        if num_results < 1:
            raise ValueError("num_results must be positive")
            
        if not 0 <= similarity_threshold <= 1:
            raise ValueError("similarity_threshold must be between 0 and 1")
            
        try:
            # Convert query vector to list for Supabase
            query_embedding_list = query_embedding.tolist()
            
            # Construct the query
            select_columns = [self.content_column] + self.metadata_columns
            select_statement = ", ".join(select_columns)
            
            logger.info(f"Executing similarity search with threshold {similarity_threshold}")
            
            response = (
                self.client.rpc(
                    "match_embeddings",
                    {
                        "query_embedding": query_embedding_list,
                        "match_threshold": similarity_threshold,
                        "match_count": num_results,
                    }
                )
                .execute()
            )
            
            # Check response for errors
            if hasattr(response, 'error') and response.error:
                error_msg = f"Supabase similarity search failed: {json.dumps(response.error)}"
                logger.error(error_msg)
                raise SupabaseConnectionError(error_msg)
                
            logger.info(f"Found {len(response.data)} matches")
            return response.data
            
        except Exception as e:
            error_msg = f"Error during similarity search: {str(e)}"
            logger.error(error_msg)
            raise SupabaseConnectionError(error_msg) from e
            
    def delete_embeddings(self, filter_dict: Dict[str, Any]) -> None:
        """Delete embeddings based on filter criteria.
        
        Args:
            filter_dict (Dict[str, Any]): Dictionary of column-value pairs to filter deletions
            
        Raises:
            ValueError: If filter_dict is empty
            SupabaseConnectionError: If Supabase operation fails
        """
        if not filter_dict:
            raise ValueError("filter_dict cannot be empty")
            
        try:
            query = self.client.table(self.table_name).delete()
            
            for column, value in filter_dict.items():
                query = query.eq(column, value)
                
            logger.info(f"Attempting to delete records with filter: {filter_dict}")
            
            response = query.execute()
            
            # Check response for errors
            if hasattr(response, 'error') and response.error:
                error_msg = f"Supabase delete failed: {json.dumps(response.error)}"
                logger.error(error_msg)
                raise SupabaseConnectionError(error_msg)
                
            logger.info("Delete operation completed successfully")
            
        except Exception as e:
            error_msg = f"Error during delete operation: {str(e)}"
            logger.error(error_msg)
            raise SupabaseConnectionError(error_msg) from e

    def normalize_vector(self, vector: np.ndarray) -> np.ndarray:
        """Normalize a vector to unit length."""
        norm = np.linalg.norm(vector)
        if norm == 0:
            return vector
        return vector / norm

    def combine_trait_vectors(self, trait_embeddings: List[Tuple[np.ndarray, float]]) -> np.ndarray:
        """Combine multiple trait embeddings with their weights."""
        if not trait_embeddings:
            raise ValueError("No trait embeddings provided")
        
        # Weight and sum the embeddings
        weighted_sum = np.zeros_like(trait_embeddings[0][0])
        for embedding, weight in trait_embeddings:
            weighted_sum += weight * embedding
        
        # Normalize to unit length
        return self.normalize_vector(weighted_sum)

    def find_similar_songs(
        self,
        trait_vector: np.ndarray,
        match_count: int,
        match_threshold: float = 0.5,
        exclude_song_id: Optional[str] = None,
        trait_names: Optional[List[str]] = None,
        trait_embeddings: Optional[List[np.ndarray]] = None
    ) -> List[SongMetadata]:
        """Find similar songs using the match_embeddings function.
        
        Args:
            trait_vector (np.ndarray): The trait vector to match against
            match_count (int): Number of songs to return
            match_threshold (float): Minimum similarity threshold (0 to 1)
            exclude_song_id (str, optional): Song ID to exclude from results
            
        Returns:
            List[SongMetadata]: List of matching songs with metadata
            
        Raises:
            SupabaseConnectionError: If Supabase operation fails
        """
        try:
            # Convert numpy array to list for Supabase
            vector_list = trait_vector.tolist()
            
            # Call the match_embeddings function via RPC
            response = self.client.rpc(
                'match_embeddings',
                {
                    'query_embedding': vector_list,
                    'match_threshold': match_threshold,
                    'match_count': match_count,
                    'exclude_song_id': exclude_song_id
                }
            ).execute()
            
            if hasattr(response, 'error') and response.error:
                error_msg = f"Supabase query failed: {json.dumps(response.error)}"
                logger.error(error_msg)
                raise SupabaseConnectionError(error_msg)
            
            # Convert results to SongMetadata objects
            songs = []
            for row in response.data:
                # Get the similarity score and normalize to 0-1 range
                similarity = float(row['similarity'])
                vibeScore = (similarity + 1) / 2
                
                songs.append(
                    SongMetadata(
                        id=row['id'],
                        preview_url=row.get('preview_url'),
                        title=row.get('title', 'Unknown Title'),
                        artist=row.get('artist', 'Unknown Artist'),
                        similarity=float(row['similarity']),
                        vibeScore=vibeScore
                    )
                )
            
            return songs
            
        except Exception as e:
            error_msg = f"Error during similarity search: {str(e)}"
            logger.error(error_msg)
            raise SupabaseConnectionError(error_msg) from e
