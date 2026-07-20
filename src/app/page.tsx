"use client";

import { useState, useRef } from "react";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

// A few voices to pick from. Full list: https://learn.microsoft.com/azure/ai-services/speech-service/language-support
const VOICES = [
  { id: "en-US-JennyNeural", label: "English (US) — Jenny" },
  { id: "en-US-GuyNeural", label: "English (US) — Guy" },
  { id: "en-GB-SoniaNeural", label: "English (UK) — Sonia" },
  { id: "my-MM-NilarNeural", label: "Burmese — Nilar" },
  { id: "my-MM-ThihaNeural", label: "Burmese — Thiha" },
];

async function getSpeechConfig() {
  const res = await fetch("/api/token");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to get Azure token");
  return SpeechSDK.SpeechConfig.fromAuthorizationToken(data.token, data.region);
}

export default function Home() {
  // ---- Text → Speech state ----
  const [text, setText] = useState("Hello! This is Azure text to speech.");
  const [voice, setVoice] = useState(VOICES[0].id);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsStatus, setTtsStatus] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // ---- Speech → Text state ----
  const [transcript, setTranscript] = useState("");
  const [recording, setRecording] = useState(false);
  const [sttStatus, setSttStatus] = useState("");
  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null);

  // ============ TEXT → SPEECH ============
  async function handleSpeak() {
    if (!text.trim()) return;
    setTtsBusy(true);
    setTtsStatus("Synthesizing…");
    setAudioUrl(null);

    try {
      const speechConfig = await getSpeechConfig();
      speechConfig.speechSynthesisVoiceName = voice;
      speechConfig.speechSynthesisOutputFormat =
        SpeechSDK.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3;

      // Pull the audio as raw bytes so we can build a downloadable/playable blob.
      const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, undefined);

      synthesizer.speakTextAsync(
        text,
        (result) => {
          if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
            const blob = new Blob([result.audioData], { type: "audio/mpeg" });
            setAudioUrl(URL.createObjectURL(blob));
            setTtsStatus("Done ✓");
          } else {
            setTtsStatus("Failed: " + result.errorDetails);
          }
          synthesizer.close();
          setTtsBusy(false);
        },
        (err) => {
          setTtsStatus("Error: " + err);
          synthesizer.close();
          setTtsBusy(false);
        }
      );
    } catch (err) {
      setTtsStatus("Error: " + (err as Error).message);
      setTtsBusy(false);
    }
  }

  // ============ SPEECH → TEXT ============
  async function startRecording() {
    setSttStatus("Listening… speak now.");
    setTranscript("");

    try {
      const speechConfig = await getSpeechConfig();
      speechConfig.speechRecognitionLanguage = "en-US";
      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
      recognizerRef.current = recognizer;

      // Fires as the user speaks (live partial results).
      recognizer.recognizing = (_s, e) => {
        setSttStatus("Hearing: " + e.result.text);
      };

      // Fires when a full phrase is finalized.
      recognizer.recognized = (_s, e) => {
        if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech && e.result.text) {
          setTranscript((prev) => (prev ? prev + " " : "") + e.result.text);
        }
      };

      recognizer.canceled = (_s, e) => {
        setSttStatus("Canceled: " + e.errorDetails);
        stopRecording();
      };

      recognizer.startContinuousRecognitionAsync();
      setRecording(true);
    } catch (err) {
      setSttStatus("Error: " + (err as Error).message);
    }
  }

  function stopRecording() {
    const recognizer = recognizerRef.current;
    if (recognizer) {
      recognizer.stopContinuousRecognitionAsync(() => {
        recognizer.close();
        recognizerRef.current = null;
      });
    }
    setRecording(false);
    setSttStatus("Stopped.");
  }

  return (
    <div className="container">
      <h1>🎙️ Speech App</h1>
      <p className="subtitle">Text-to-speech & speech-to-text with Azure Cognitive Services</p>

      <p style={{ marginBottom: "1.5rem" }}>
        <a href="/practice" style={{ color: "#60a5fa" }}>
          🗣️ Try Pronunciation Practice →
        </a>
      </p>

      {/* ---------- Text → Speech ---------- */}
      <div className="card">
        <h2>🔊 Text → Speech</h2>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type something to speak…"
        />
        <select value={voice} onChange={(e) => setVoice(e.target.value)}>
          {VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
        <button onClick={handleSpeak} disabled={ttsBusy}>
          {ttsBusy ? "Working…" : "Speak"}
        </button>
        {ttsStatus && <p className="status">{ttsStatus}</p>}
        {audioUrl && <audio controls autoPlay src={audioUrl} />}
      </div>

      {/* ---------- Speech → Text ---------- */}
      <div className="card">
        <h2>📝 Speech → Text</h2>
        <button
          className={recording ? "recording" : ""}
          onClick={recording ? stopRecording : startRecording}
        >
          {recording ? "⏹ Stop" : "🎤 Start recording"}
        </button>
        {sttStatus && <p className="status">{sttStatus}</p>}
        <div className="result">{transcript || "Your transcription will appear here…"}</div>
      </div>
    </div>
  );
}
