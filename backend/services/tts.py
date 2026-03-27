import base64
import json as _json
import requests
import threading
import time
from typing import Optional

VOICES = {
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
    "fr_001": "French - Male 1",
    "fr_002": "French - Male 2",
    "de_001": "German - Female",
    "de_002": "German - Male",
    "es_002": "Spanish - Male",
    "es_mx_002": "Spanish MX - Male",
    "br_001": "Portuguese BR - Female 1",
    "br_003": "Portuguese BR - Female 2",
    "br_004": "Portuguese BR - Female 3",
    "br_005": "Portuguese BR - Male",
    "id_001": "Indonesian - Female",
    "jp_001": "Japanese - Female 1",
    "jp_003": "Japanese - Female 2",
    "jp_005": "Japanese - Female 3",
    "jp_006": "Japanese - Male",
    "kr_002": "Korean - Male 1",
    "kr_003": "Korean - Female",
    "kr_004": "Korean - Male 2",
    "en_male_narration": "Narrator",
    "en_male_funny": "Wacky",
    "en_female_emotional": "Peaceful",
}

ENDPOINTS = [
    "https://tiktok-tts.weilnet.workers.dev/api/generation",
    "https://tiktoktts.com/api/tiktok-tts",
]

TEXT_BYTE_LIMIT = 300

# Reusable HTTP session — connection pooling across all TTS calls
_session = requests.Session()
_session.headers.update({"Content-Type": "application/json"})

# Endpoint health cache — avoid checking every call
_endpoint_status: dict[str, tuple[bool, float]] = {}
_ENDPOINT_TTL = 60.0
_endpoint_lock = threading.Lock()


def _endpoint_ok(endpoint_index: int) -> bool:
    """Check if endpoint is available, with 60s TTL cache."""
    base_url = ENDPOINTS[endpoint_index].split("/a")[0]
    with _endpoint_lock:
        cached = _endpoint_status.get(base_url)
        if cached and (time.monotonic() - cached[1]) < _ENDPOINT_TTL:
            return cached[0]
    try:
        r = _session.get(base_url, timeout=3)
        ok = r.status_code == 200
    except requests.RequestException:
        ok = False
    with _endpoint_lock:
        _endpoint_status[base_url] = (ok, time.monotonic())
    return ok


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
    response = _session.post(endpoint, json={"text": text, "voice": voice}, timeout=15)
    return response.content


def _extract_base64(audio_response: bytes, endpoint_index: int) -> Optional[str]:
    """Parse base64 audio data from TTS API response."""
    try:
        data = _json.loads(audio_response)
        if endpoint_index == 0:
            return data.get("data")
        else:
            data_uri = data.get("audio", "") or data.get("data", "")
            if "," in data_uri:
                return data_uri.split(",", 1)[1]
            return data_uri or None
    except (_json.JSONDecodeError, AttributeError):
        return None


def generate_tts(text: str, voice: str = "jp_001") -> Optional[str]:
    """Generate TTS audio and return base64-encoded MP3 data."""
    if not text or voice not in VOICES:
        return None

    for endpoint_index, endpoint in enumerate(ENDPOINTS):
        try:
            if not _endpoint_ok(endpoint_index):
                continue

            if len(text) < TEXT_BYTE_LIMIT:
                audio = _generate_audio(text, voice, endpoint)
                audio_b64 = _extract_base64(audio, endpoint_index)
                if audio_b64 and audio_b64 != "error":
                    return audio_b64
            else:
                text_parts = _split_string(text, 299)
                audio_parts: list[Optional[str]] = [None] * len(text_parts)

                def gen_thread(part: str, idx: int):
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
                    # Decode each part, concatenate raw bytes, re-encode
                    raw = b"".join(base64.b64decode(p) for p in audio_parts)
                    return base64.b64encode(raw).decode("utf-8")

        except requests.RequestException:
            continue

    return None


def list_voices() -> list[dict]:
    return [{"id": k, "name": v} for k, v in VOICES.items()]
