import json
import os
from datetime import datetime

SESSIONS_DIR = "logs/sessions"

if not os.path.exists(SESSIONS_DIR):
    os.makedirs(SESSIONS_DIR, exist_ok=True)

def save_session(session_id: str, data: dict):
    """Saves session data to a local JSON file."""
    try:
        file_path = os.path.join(SESSIONS_DIR, f"{session_id}.json")
        
        # Add timestamp if not present
        if 'updated_at' not in data:
            data['updated_at'] = datetime.now().isoformat()
        else:
            data['updated_at'] = datetime.now().isoformat()

        if 'created_at' not in data:
            data['created_at'] = datetime.now().isoformat()

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        return True
    except Exception as e:
        print(f"Error saving session {session_id}: {e}")
        return False

def load_session(session_id: str):
    """Loads session data from a local JSON file."""
    try:
        file_path = os.path.join(SESSIONS_DIR, f"{session_id}.json")
        if os.path.exists(file_path):
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        return None
    except Exception as e:
        print(f"Error loading session {session_id}: {e}")
        return None

def list_sessions():
    """Lists all available session IDs."""
    try:
        files = os.listdir(SESSIONS_DIR)
        return [f.replace(".json", "") for f in files if f.endswith(".json")]
    except Exception as e:
        print(f"Error listing sessions: {e}")
        return []
