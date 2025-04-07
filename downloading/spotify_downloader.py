import os
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from dotenv import load_dotenv
import requests
import json
import re
from pathlib import Path
import time
from typing import Optional, Dict, Any
from bs4 import BeautifulSoup

# Load environment variables
load_dotenv()

# Spotify API credentials
SPOTIFY_CLIENT_ID = os.getenv('SPOTIFY_CLIENT_ID')
SPOTIFY_CLIENT_SECRET = os.getenv('SPOTIFY_CLIENT_SECRET')
SPOTIFY_REDIRECT_URI = os.getenv('SPOTIFY_REDIRECT_URI', 'http://localhost:8888/callback')

# Deezer API configuration
DEEZER_API_BASE = "https://api.deezer.com"
DEEZER_RATE_LIMIT = 50  # requests per second
DEEZER_REQUEST_DELAY = 1.0 / DEEZER_RATE_LIMIT  # delay between requests in seconds

# Create output directory for previews
PREVIEW_DIR = Path('data/previews')
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

def setup_spotify():
    """Set up Spotify client with authentication."""
    auth_manager = SpotifyOAuth(
        client_id=SPOTIFY_CLIENT_ID,
        client_secret=SPOTIFY_CLIENT_SECRET,
        redirect_uri=SPOTIFY_REDIRECT_URI,
        scope='user-library-read',
        open_browser=False  # Prevent automatic browser opening
    )
    
    # Check if we need to get a new token
    if not auth_manager.get_cached_token():
        # Get the authorization URL
        auth_url = auth_manager.get_authorize_url()
        print("\n----------------------------------------")
        print("Please navigate to this URL in your browser:")
        print(auth_url)
        print("----------------------------------------\n")
        
        # Ask for the redirect URL after authentication
        code = input("After authorizing, paste the code query parameter from the redirect url here: ")
        
        # Get access token using the code
        auth_manager.get_access_token(code)
    
    return spotipy.Spotify(auth_manager=auth_manager)

def get_liked_songs(sp):
    """Fetch all liked songs from the user's library."""
    results = sp.current_user_saved_tracks()
    tracks = results['items']
    
    print(f"Found {len(tracks)} liked songs")
    
    
    # Get all tracks (handle pagination)
    while results['next']:
        results = sp.next(results)
        print(f"Found {len(results['items'])} liked songs")
        tracks.extend(results['items'])
    
    return tracks

def get_preview_url_from_embed(track_id):
    """Workaround to get preview URL from Spotify's embed page."""
    embed_url = f"https://open.spotify.com/embed/track/{track_id}"
    
    try:
        response = requests.get(embed_url)
        if response.status_code != 200:
            print(f"Failed to fetch embed page: {response.status_code}")
            return None
        
        # Parse the HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find the script containing the JSON data
        script_tags = soup.find_all('script')
        for script in script_tags:
            if script.string and 'audioPreview' in script.string:
                # Extract the JSON using regex
                match = re.search(r'Spotify\.Entity = (.+?)};', script.string)
                if match:
                    data_json = match.group(1) + '}'
                    try:
                        data = json.loads(data_json)
                        if 'audioPreview' in data and 'url' in data['audioPreview']:
                            return data['audioPreview']['url']
                    except json.JSONDecodeError:
                        pass
        
        print(f"Couldn't find audioPreview in embed page for track {track_id}")
        return None
    except Exception as e:
        print(f"Error fetching preview from embed: {e}")
        return None

def search_deezer_track(track_name: str, artist_name: str, max_retries: int = 3) -> Optional[Dict[str, Any]]:
    """
    Search for a track on Deezer with exponential backoff.
    
    Args:
        track_name: Name of the track to search for
        artist_name: Name of the artist
        max_retries: Maximum number of retry attempts
    
    Returns:
        Dict containing track information if found, None otherwise
    """
    query = f"{track_name} {artist_name}"
    encoded_query = requests.utils.quote(query)
    url = f"{DEEZER_API_BASE}/search?q={encoded_query}"
    
    for attempt in range(max_retries):
        try:
            # Respect rate limiting
            time.sleep(DEEZER_REQUEST_DELAY)
            
            response = requests.get(url)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('data') and len(data['data']) > 0:
                    return data['data'][0]
            elif response.status_code in (403, 429):
                # Calculate exponential backoff delay
                backoff_delay = (2 ** attempt) * DEEZER_REQUEST_DELAY
                print(f"Rate limited. Waiting {backoff_delay:.2f} seconds before retry...")
                time.sleep(backoff_delay)
            else:
                print(f"Error searching Deezer: {response.status_code}")
                return None
                
        except Exception as e:
            print(f"Error during Deezer search: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
            else:
                return None
    
    return None

def get_safe_filename(track_name: str, artist_name: str) -> str:
    """Create a safe filename for a track."""
    filename = f"{artist_name} - {track_name}.mp3"
    return "".join(c for c in filename if c.isalnum() or c in (' ', '-', '_', '.'))

def download_preview(track: Dict[str, Any], output_dir: Path) -> None:
    """Download the preview of a track using Deezer's API."""
    track_name = track['track']['name']
    artist_name = track['track']['artists'][0]['name']
    
    # Create a safe filename
    filename = get_safe_filename(track_name, artist_name)
    filepath = output_dir / filename
    
    # Check if file already exists
    if filepath.exists():
        print(f"Skipping {track_name} - already downloaded")
        return
    
    print(f"Processing: {track_name} by {artist_name}")
    
    # Search for the track on Deezer
    deezer_track = search_deezer_track(track_name, artist_name)
    
    if not deezer_track or not deezer_track.get('preview'):
        print(f"No preview available for {track_name}")
        return
    
    preview_url = deezer_track['preview']
    
    # Download the preview
    print(f"Downloading from: {preview_url}")
    response = requests.get(preview_url)
    if response.status_code == 200:
        with open(filepath, 'wb') as f:
            f.write(response.content)
        print(f"Downloaded preview for: {track_name}")
    else:
        print(f"Failed to download preview for {track_name} (Status: {response.status_code})")

def main():
    # Check for required environment variables
    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        print("Error: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in .env file")
        return
    
    # Set up Spotify client
    sp = setup_spotify()
    
    # Get liked songs
    print("Fetching liked songs...")
    tracks = get_liked_songs(sp)
    print(f"Found {len(tracks)} liked songs")
    
    # Count existing files
    existing_files = set(f.name for f in PREVIEW_DIR.glob("*.mp3"))
    print(f"Found {len(existing_files)} existing preview files")
    
    # Download previews using Deezer
    print("\nDownloading previews from Deezer...")
    for track in tracks:
        download_preview(track, PREVIEW_DIR)
    
    print("\nDownload complete!")

if __name__ == "__main__":
    main() 