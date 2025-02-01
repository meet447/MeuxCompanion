from pytchat import LiveChat, SpeedCalculator
import pytchat
import time
from models.llm import rika
from models.tts import tts
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
        
            tts(text=response, voice='jp_001')
    
            if schat.get() >= 20:
                chat.terminate()
                schat.terminate()
                return

            time.sleep(1)