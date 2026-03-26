import base64
import requests
import threading
from typing import Optional

VOICES = {
    # ENGLISH VOICES
    "en_au_001": "English AU - Female",
    "en_au_002": "English AU - Male",
    "en_uk_001": "English UK - Male 1",
    "en_uk_003": "English UK - Male 2",
    "en_us_001": "English US - Female 1",
    "en_us_002": "English US - Female 2",
    "en_us_006": "English US - Male 1",
    "en_us_007": "English US - Male 2",
    "en_us_009": "English US - Male 3",
    "en_us_010": "English US - Male 4",
    # EUROPE VOICES
    "fr_001": "French - Male 1",
    "fr_002": "French - Male 2",
    "de_001": "German - Female",
    "de_002": "German - Male",
    "es_002": "Spanish - Male",
    # AMERICA VOICES
    "es_mx_002": "Spanish MX - Male",
    "br_001": "Portuguese BR - Female 1",
    "br_003": "Portuguese BR - Female 2",
    "br_004": "Portuguese BR - Female 3",
    "br_005": "Portuguese BR - Male",
    # ASIA VOICES
    "id_001": "Indonesian - Female",
    "jp_001": "Japanese - Female 1",
    "jp_003": "Japanese - Female 2",
    "jp_005": "Japanese - Female 3",
    "jp_006": "Japanese - Male",
    "kr_002": "Korean - Male 1",
    "kr_003": "Korean - Female",
    "kr_004": "Korean - Male 2",
    # OTHER
    "en_male_narration": "Narrator",
    "en_male_funny": "Wacky",
    "en_female_emotional": "Peaceful",
}

ENDPOINTS = [
    "https://tiktok-tts.weilnet.workers.dev/api/generation",
    "https://tiktoktts.com/api/tiktok-tts",
]

TEXT_BYTE_LIMIT = 300


def _split_string(string: str, chunk_size: int) -> list[str]:
    words = string.split()
    result = []
    current_chunk = ""
    for word in words:
        if len(current_chunk) + len(word) + 1 <= chunk_size:
            current_chunk += f" {word}"
        else:
            if current_chunk:
                result.append(current_chunk.strip())
            current_chunk = word
    if current_chunk:
        result.append(current_chunk.strip())
    return result


def _generate_audio(text: str, voice: str, endpoint: str) -> bytes:
    headers = {"Content-Type": "application/json"}
    data = {"text": text, "voice": voice}
    response = requests.post(endpoint, headers=headers, json=data, timeout=15)
    return response.content


def _extract_base64(audio_response: bytes, endpoint_index: int) -> Optional[str]:
    raw = str(audio_response)
    try:
        if endpoint_index == 0:
            return raw.split('"')[5]
        else:
            return raw.split('"')[3].split(",")[1]
    except (IndexError, ValueError):
        return None


def generate_tts(text: str, voice: str = "jp_001") -> Optional[str]:
    """Generate TTS audio and return base64-encoded MP3 data."""
    if not text or voice not in VOICES:
        return None

    # Try each endpoint
    for endpoint_index, endpoint in enumerate(ENDPOINTS):
        try:
            # Check availability
            base_url = endpoint.split("/a")[0]
            check = requests.get(base_url, timeout=5)
            if check.status_code != 200:
                continue

            if len(text) < TEXT_BYTE_LIMIT:
                audio = _generate_audio(text, voice, endpoint)
                audio_b64 = _extract_base64(audio, endpoint_index)
                if audio_b64 and audio_b64 != "error":
                    return audio_b64
            else:
                text_parts = _split_string(text, 299)
                audio_parts = [None] * len(text_parts)

                def gen_thread(part, idx):
                    audio = _generate_audio(part, voice, endpoint)
                    b64 = _extract_base64(audio, endpoint_index)
                    if b64 and b64 != "error":
                        audio_parts[idx] = b64

                threads = []
                for i, part in enumerate(text_parts):
                    t = threading.Thread(target=gen_thread, args=(part, i))
                    t.start()
                    threads.append(t)

                for t in threads:
                    t.join()

                if all(p is not None for p in audio_parts):
                    return "".join(audio_parts)

        except requests.RequestException:
            continue

    return None


def list_voices() -> list[dict]:
    """Return available voices."""
    return [{"id": k, "name": v} for k, v in VOICES.items()]
