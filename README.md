# AI YouTube VTuber Completly api free

This repository contains the code for an AI YouTube VTuber, a virtual content creator that interacts with viewers using automated responses and voice generation. The VTuber is powered by various AI models and technologies. Below is an overview of the main components and how to set up and use this project.

Uses my Rika api based on rika web i created check rika web out [Chipling AI](chipling.xyz)
to create your custom vtuber create a new character at rika web!

## Components

### `main.py`
This script is responsible for reading and processing the YouTube chat. It continuously reads the chat messages and responds using AI-generated messages and voice.

### `llm.py`
This script interacts with the Rika API, which generates text-based responses using AI. It sends queries to the API and processes the received responses.

### `tts.py`
This script includes multiple methods for generating and playing back speech. It utilizes APIs and libraries like ElevenLabs, gTTS (Google Text-to-Speech), pyttsx3, and playsound to convert text into speech and play it back.

### `chat.py`
Similar to `tts.py`, this script provides methods for generating AI-based responses and converting them into speech. It also includes interactions with ElevenLabs and gTTS.

## Setup

1. Clone the repository to your local machine.
   
2. Make sure you have Python installed (version 3.6 or higher).

3. Install the required libraries by running the following command in your terminal:

   ```
   pip install -r requirements.txt
   ```

## Usage

1. Run `main.py` to start the VTuber's chat interaction loop. This script reads the YouTube chat and responds using AI-generated messages and voice.

2. As viewers interact in the YouTube chat, the VTuber will respond with text messages and synthesized speech.

3. The VTuber's responses can be configured based on the AI models and technologies you integrate.

## Important Notes

- Ensure you have the necessary API keys, permissions, and credentials for the AI models and services you are using.

- Be cautious about rate limiting and usage policies for third-party APIs to avoid unexpected disruptions.

- Adjust the sleep duration in the `main.py` script (`time.sleep(2)`) according to your preferences and the pace of the conversation.

## Disclaimer

Make sure to comply with YouTube's terms of service and community guidelines while using automated systems for content creation and interaction.

## Contribution

Feel free to contribute to this project by opening pull requests or suggesting improvements. If you encounter any issues, please submit them in the issue tracker.

## Contact

For questions or feedback, you can reach out to the project maintainer at [meet.sonawane2015@gmail.com](mailto:meet.sonawane2015@gmail.com).

---

Please ensure you've properly attributed and referenced any third-party code, libraries, or APIs you're using in your project. Additionally, consider providing a license for your project so that others understand how they can use and distribute your code.
