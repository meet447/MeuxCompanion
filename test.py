import requests

# URL of the API endpoint
url = "https://your-api-url-here.com/api/rikav2"

# Data to be sent in the request
data = {
    "text": "Your text goes here",
    "id": "Your ID goes here"
}

# Send a POST request to the API endpoint
response = requests.post(url, json=data)

# Check the response
if response.status_code == 200:
    result = response.json()
    print("API Response:", result)
else:
    print(f"Request failed with status code {response.status_code}")
    print("Response content:", response.text)
