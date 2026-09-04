"""
JARVIS 2.0 - Procedural Sci-Fi Audio Synthesizer & Speech Module
Generates real-time dynamic frequency-swept sound effects using NumPy and Pygame mixer,
with asynchronous speech feedback via pyttsx3.
"""

import math
import numpy as np
import pygame
import threading
import queue

_SOUND_CACHE = {}
_MIXER_INITIALIZED = False
_SPEECH_QUEUE = queue.Queue()
_SPEECH_THREAD = None


def init_audio():
    """Initializes the pygame mixer with CD-quality 44.1kHz audio."""
    global _MIXER_INITIALIZED
    if _MIXER_INITIALIZED:
        return True
    try:
        pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=512)
        pygame.mixer.set_num_channels(16)
        _MIXER_INITIALIZED = True
        _start_speech_worker()
        return True
    except Exception as e:
        print(f"[AudioSynth] Warning: Failed to initialize audio mixer: {e}")
        return False


def _generate_chirp_sound(start_freq: float, end_freq: float, duration: float = 0.08, wave_type: str = 'sine', volume: float = 0.25):
    """Synthesizes a frequency sweep wave into a pygame.mixer.Sound."""
    sample_rate = 44100
    n_samples = max(1, int(sample_rate * duration))
    t = np.linspace(0, duration, n_samples, endpoint=False)

    # Linear frequency ramp
    phase = 2 * np.pi * (start_freq * t + 0.5 * (end_freq - start_freq) * (t ** 2) / duration)

    if wave_type == 'sine':
        wave = np.sin(phase)
    elif wave_type == 'square':
        wave = np.sign(np.sin(phase))
    elif wave_type == 'triangle':
        wave = 2 * np.abs(2 * (phase / (2 * np.pi) - np.floor(phase / (2 * np.pi) + 0.5))) - 1
    else:
        wave = np.sin(phase)

    # Exponential attack-decay envelope to eliminate pops
    attack_samples = max(1, int(sample_rate * 0.005))
    decay_samples = max(1, int(sample_rate * (duration - 0.005)))
    envelope = np.ones(n_samples, dtype=np.float32)
    envelope[:attack_samples] = np.linspace(0, 1, attack_samples)
    envelope[-decay_samples:] = np.linspace(1, 0, decay_samples) ** 1.5

    samples = (wave * envelope * volume * 32767).astype(np.int16)
    stereo = np.column_stack((samples, samples))
    return pygame.sndarray.make_sound(stereo)


def play_chirp(start_freq: float, end_freq: float, duration: float = 0.08, wave_type: str = 'sine', volume: float = 0.22):
    """Plays a sci-fi sweep sound, with in-memory caching for instant latency."""
    global _MIXER_INITIALIZED
    if not _MIXER_INITIALIZED and not init_audio():
        return

    cache_key = (round(start_freq), round(end_freq), round(duration, 3), wave_type, round(volume, 2))
    sound = _SOUND_CACHE.get(cache_key)
    if sound is None:
        try:
            sound = _generate_chirp_sound(start_freq, end_freq, duration, wave_type, volume)
            _SOUND_CACHE[cache_key] = sound
        except Exception as e:
            return

    try:
        sound.play()
    except Exception:
        pass


# Pre-configured futuristic feedback sound events
def sfx_hover():
    play_chirp(850, 1150, 0.04, 'sine', 0.15)

def sfx_grab():
    play_chirp(500, 950, 0.08, 'sine', 0.25)

def sfx_release():
    play_chirp(900, 450, 0.08, 'sine', 0.22)

def sfx_launch():
    play_chirp(750, 1750, 0.18, 'sine', 0.32)

def sfx_switch():
    play_chirp(600, 1100, 0.10, 'triangle', 0.25)

def sfx_back():
    play_chirp(1050, 520, 0.14, 'sine', 0.28)

def sfx_prayer_close():
    play_chirp(1300, 380, 0.26, 'sine', 0.30)

def sfx_error():
    play_chirp(220, 160, 0.12, 'square', 0.18)


# --- Asynchronous Speech Dispatcher ---
def _speech_worker():
    try:
        import pyttsx3
        engine = pyttsx3.init()
        engine.setProperty('rate', 170)
        engine.setProperty('volume', 0.8)
    except Exception:
        engine = None

    while True:
        text = _SPEECH_QUEUE.get()
        if text is None:
            break
        if engine:
            try:
                engine.say(text)
                engine.runAndWait()
            except Exception:
                pass
        _SPEECH_QUEUE.task_done()


def _start_speech_worker():
    global _SPEECH_THREAD
    if _SPEECH_THREAD is None:
        _SPEECH_THREAD = threading.Thread(target=_speech_worker, daemon=True)
        _SPEECH_THREAD.start()


def speak(phrase: str):
    """Queues a short spoken confirmation without stuttering the frame loop."""
    if phrase:
        _SPEECH_QUEUE.put(phrase)
