from pytchat import LiveChat, SpeedCalculator
import pytchat
import time
from models.llm import rika
from models.tts import tts, gtts, pyttsx3, Eleven
from config import video_id, voice

def readChat():
    chat = pytchat.create(video_id=video_id)
    schat = pytchat.create(video_id=video_id, processor=SpeedCalculator(capacity=20))

    while chat.is_alive():
        for c in chat.get().sync_items():
            print(f"\n{c.datetime} [{c.author.name}]- {c.message}\n")
            message = c.message
            
            response = rika(message)
            print(response)
            
            if voice == "pyttsx3":
                pyttsx3(response)
            elif voice == "gtts":
                gtts(response)
            elif voice == "tts":
                tts(response)
            elif voice == "eleven":
                Eleven(response)
    
            if schat.get() >= 20:
                chat.terminate()
                schat.terminate()
                return

            time.sleep(1)