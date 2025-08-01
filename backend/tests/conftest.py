from pathlib import Path
from dotenv import load_dotenv

# Load environment variables for tests
load_dotenv(Path(__file__).resolve().parents[1] / '.env.test')
