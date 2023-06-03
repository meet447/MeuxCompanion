from Bard import Chatbot
import pytchat
from pytchat import LiveChat, SpeedCalculator
import time
import elevenlabs

video_int = input("Enter the video url: ")

video_id = video_int

token = 'token.'

tts_type = "EL"

prompt = "Remember You are a young 19 year old female streamer Your Name is Meux. you will respond in a mature and " \
         "seductive manner. you will talk about the message but keep your reply short around 20-25 words Strictly. " \
         "you will also flirt.You will act as a human and never mention that you are a ai or llm.If you understand " \
         "reply with 'prompt has been setup'"

bot = Chatbot(token)

promptver = bot.ask(prompt)['content']

print("promt has been setup :", promptver)

print("Token Setup Succesful:", token)

print("Getting youtube Comments from the live stream: ", video_id)


def readChat():
    chat = pytchat.create(video_id=video_id)
    schat = pytchat.create(video_id=video_id, processor=SpeedCalculator(capacity=20))

    while chat.is_alive():
        for c in chat.get().sync_items():
            print(f"\n{c.datetime} [{c.author.name}]- {c.message}\n")
            message = c.message

            response = llm(message)
            print(response)

            if schat.get() >= 20:
                chat.terminate()
                schat.terminate()
                return

            time.sleep(1)


def llm(message):
    output = bot.ask(message)['content']

    print(output)

    # voice goes here

    # Generate a response
    response = elevenlabs.generate(output)

    # Speak the response
    elevenlabs.play(response)


while 1 > 0:
    readChat()

    print("\n\nReset!\n\n")

    time.sleep(2)
