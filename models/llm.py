import requests
import json

url = "https://rika-web.meetsonawane.repl.co/api/rikav2"

def rika(query):
	data = {
		'text': query,
		'id': '480a68e03f5b11ee84544133defb16e1'
	}

	# Convert the data to JSON format
	data_json = json.dumps(data)

	# Set the Content-Type header to application/json
	headers = {'Content-Type': 'application/json'}

	# Send the POST request
	response = requests.post(url, data=data_json, headers=headers)

	# Print the response
	return response.json()['results']
 
