import requests
import time
from config import char_details

def rika(query):
    url_prediction = "http://chipling.xyz/api/prediction"
    params_prediction = {
        "prompt": char_details + query,
        "neg_prompt": "Your negative prompt",
        "model": "mistralai/mistral-7b-instruct-v0.1",
        "cfg": "Your cfg",
        "seed": "Your seed",
        "steps": "Your steps"
    }

    # Make the prediction request
    response_prediction = requests.get(url_prediction, params=params_prediction)

    # Check if the request was successful (status code 200)
    if response_prediction.status_code == 200:
        data_prediction = response_prediction.json()
        prediction_id = data_prediction
        print(f"Prediction ID: {prediction_id}")

        # Keep fetching the response until status is 'succeeded'
        while True:
            url_response = f"http://chipling.xyz/api/response?id={prediction_id}"
            response_response = requests.get(url_response)

            if response_response.status_code == 200:
                data_response = response_response.json()
                status = data_response.get("status")

                if status == "succeeded":
                    print("Prediction Succeeded!")
                    output_list = data_response.get("output")
                    print(f"Output URL: {output_list}")
                    output_sentence = ' '.join(output_list).strip()
                    print(f"Output Sentence: {output_sentence}")
                    return output_sentence                    
                elif status == "failed":
                    print("Prediction Failed!")
                    break
                else:
                    print(f"Status: {status}. Waiting for completion...")
                    time.sleep(5)  # Adjust the sleep duration based on your needs

            else:
                print(f"Error fetching response: {response_response.status_code}, {response_response.text}")
                break

    else:
        print(f"Error making prediction request: {response_prediction.status_code}, {response_prediction.text}")

