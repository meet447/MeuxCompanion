import requests
import json
from config import char_id  # Make sure you have char_id defined in your config file

url = "https://chipling-web-1.meetsonawane.repl.co/api/rikav2"  # Remove extra slashes in the URL

def rika(query):
    data = {
        'text': query,
        'id': char_id
    }

    response = requests.post(url, json=data)

    # Check the response
    result = response.json()
    print("API Response:", result)

    # Print the response
    return result['results']
