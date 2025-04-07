from typing import List, Dict, Any, Optional
import numpy as np
from supabase import create_client
from dotenv import load_dotenv
import os

class SupabaseVectorStore:
    def __init__(
        self,
        table_name: str = "embeddings",
        embedding_column: str = "embedding",
        content_column: str = "content",
        metadata_columns: Optional[List[str]] = None,
    ):
        """Initialize the Supabase Vector Store.
        
        Args:
            table_name (str): Name of the table to store vectors
            embedding_column (str): Name of the column containing the vector embeddings
            content_column (str): Name of the column containing the text content
            metadata_columns (List[str], optional): Additional metadata columns to store/retrieve
        """
        load_dotenv()
        
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        
        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in environment variables")
            
        self.client = create_client(supabase_url, supabase_key)
        self.table_name = table_name
        self.embedding_column = embedding_column
        self.content_column = content_column
        self.metadata_columns = metadata_columns or []
        
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
        """
        if len(embeddings) != len(contents):
            raise ValueError("Number of embeddings must match number of contents")
            
        if metadata and len(metadata) != len(embeddings):
            raise ValueError("Number of metadata items must match number of embeddings")
            
        records = []
        for i, (embedding, content) in enumerate(zip(embeddings, contents)):
            record = {
                self.embedding_column: embedding.tolist(),
                self.content_column: content,
            }
            
            if metadata:
                for key in self.metadata_columns:
                    if key in metadata[i]:
                        record[key] = metadata[i][key]
                        
            records.append(record)
            
        self.client.table(self.table_name).insert(records).execute()
        
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
        """
        # Convert query vector to list for Supabase
        query_embedding_list = query_embedding.tolist()
        
        # Construct the query
        select_columns = [self.content_column] + self.metadata_columns
        select_statement = ", ".join(select_columns)
        
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
        
        return response.data
    
    def delete_embeddings(self, filter_dict: Dict[str, Any]) -> None:
        """Delete embeddings based on filter criteria.
        
        Args:
            filter_dict (Dict[str, Any]): Dictionary of column-value pairs to filter deletions
        """
        query = self.client.table(self.table_name).delete()
        
        for column, value in filter_dict.items():
            query = query.eq(column, value)
            
        query.execute()