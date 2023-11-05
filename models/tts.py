import elevenlabs
from gtts import gTTS
import os
import pyttsx3
import time
import requests
from audio import play_audio

def Eleven(message):
    # Define the URL and request headers
    url = "https://api.elevenlabs.io/v1/text-to-speech/LcfcDJNUP1GQjkzn1xUU/stream"
    headers = {
        "Content-Type": "application/json",
        "Origin": "https://elevenlabs.io",
        "Referer": "https://elevenlabs.io/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    }

    # Define the request payload (JSON data)
    payload = {
        "text": message,
        "model_id": "eleven_multilingual_v1"
    }

    # Send the POST request
    response = requests.post(url, headers=headers, json=payload)

    # Check the response status code and content
    if response.status_code == 200:
        # If the response content type is audio/mpeg, you can save it to a file
        if response.headers.get("Content-Type") == "audio/mpeg":
            with open("audio.mp3", "wb") as audio_file:
                audio_file.write(response.content)
                print("mp3 done")
                audio = "audio.mp3"
                play_audio(audio=audio)
                
        else:
            print("Unexpected response content type:", response.headers.get("Content-Type"))
    else:
        print("Request failed with status code:", response.status_code)

def tts(message):
    # Generate a response
    response = elevenlabs.generate(message)

    # Speak the response
    elevenlabs.play(response)
    
def gtts(message):

    language = 'en'
    
    myobj = gTTS(text=message, lang=language, slow=False)
    
    myobj.save("voice.mp3")

    play_audio("voice.mp3")
    
    os.remove("voice.mp3")

def pyttsx3(message):
	engine = pyttsx3.init()
	engine.say("I will speak this text")
	engine.runAndWait()
 
