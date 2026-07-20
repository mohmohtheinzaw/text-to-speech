"use client";

import { useState, useRef } from "react";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

// The lesson: swap these for any words/phrases you want learners to practice.
const LESSON_WORDS = [
  "I feel happy when the sun is shining.",
  "She painted a beautiful picture of the mountains.",
  "This chair is very comfortable to sit in.",
  "Every challenge is an opportunity to learn.",
  "We have a team meeting every Wednesday morning.",
  "He added a fresh vegetable to the salad.",
  "My birthday is in the middle of February.",
  "Please put the milk back in the refrigerator.",
  "The children were happy to see the puppy.",
  "The beautiful garden was full of colorful flowers.",
  "I bought a comfortable pair of running shoes.",
  "Thank you for giving me this wonderful opportunity.",
  "The library is closed next Wednesday for repairs.",
  "A carrot is my favorite vegetable to snack on.",
  "It often snows here during the month of February.",
  "The refrigerator keeps our food cold and fresh.",
  "Getting a good night's sleep makes me happy.",
  "What a beautiful and peaceful evening it is.",
  "Make yourself comfortable while I make some tea.",
  "This new job is a great opportunity for my career.",
];

const REFERENCE_VOICE = "en-US-JennyNeural";

async function getSpeechConfig() {
  const res = await fetch("/api/token");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to get Azure token");
  return SpeechSDK.SpeechConfig.fromAuthorizationToken(data.token, data.region);
}

type WordScore = {
  word: string;
  accuracy: number; // 0-100 for this specific word
  errorType: string; // "None" | "Mispronunciation" | "Omission" | ...
};

// 1–5 rating: the word has to MATCH (meaning) to score 3+, and pronunciation
// quality decides how high. A well-pronounced wrong word tops out at 2.
function starRating(matched: boolean, pronScore: number): number {
  if (matched) {
    if (pronScore >= 85) return 5;
    if (pronScore >= 70) return 4;
    if (pronScore >= 50) return 3;
    return 2;
  }
  return pronScore >= 60 ? 2 : 1;
}

const RATING_LABELS = [
  "",
  "Try again",
  "Almost — keep practicing",
  "Good 👍",
  "Great!",
  "Perfect! 🎉",
];

const ratingColor = (r: number) =>
  r >= 4 ? "#22c55e" : r === 3 ? "#eab308" : "#ef4444";

type Assessment = {
  recognizedText: string;
  accuracy: number;
  fluency: number;
  completeness: number;
  pronScore: number; // overall
  words: WordScore[];
};

export default function Practice() {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<Assessment | null>(null);
  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null);

  const currentWord = LESSON_WORDS[index];

  // ---- Play the correct pronunciation (so the learner hears the target) ----
  async function playReference() {
    setStatus("Loading correct pronunciation…");
    try {
      const speechConfig = await getSpeechConfig();
      speechConfig.speechSynthesisVoiceName = REFERENCE_VOICE;
      // Pass `null` (not `undefined`) so the SDK does NOT auto-play through the
      // default speaker. With `undefined` it plays automatically AND we play the
      // blob manually below, so the same audio overlaps itself — that's the echo.
      const synth = new SpeechSDK.SpeechSynthesizer(speechConfig, null);
      synth.speakTextAsync(
        currentWord,
        (r) => {
          if (r.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
            const blob = new Blob([r.audioData], { type: "audio/mpeg" });
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => URL.revokeObjectURL(url);
            audio.play();
            setStatus("");
          }
          synth.close();
        },
        (e) => {
          setStatus("Error: " + e);
          synth.close();
        }
      );
    } catch (err) {
      setStatus("Error: " + (err as Error).message);
    }
  }

  // ---- Record the learner and score their pronunciation against currentWord ----
  async function startAssessment() {
    setResult(null);
    setBusy(true);
    setStatus("🎤 Listening… say the word clearly.");

    try {
      const speechConfig = await getSpeechConfig();
      speechConfig.speechRecognitionLanguage = "en-US";
      // Give the learner time to start speaking, and don't cut short words off.
      speechConfig.setProperty(
        SpeechSDK.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
        "10000"
      );
      speechConfig.setProperty(
        SpeechSDK.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
        "1500"
      );
      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
      recognizerRef.current = recognizer;

      // Bias recognition toward the expected word — without this, isolated
      // short words are often misheard as homophones or return NoMatch.
      SpeechSDK.PhraseListGrammar.fromRecognizer(recognizer).addPhrase(currentWord);

      // The heart of it: tell Azure the word we EXPECT, and ask it to grade
      // the learner's speech against that reference.
      const pronConfig = new SpeechSDK.PronunciationAssessmentConfig(
        currentWord,
        SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
        SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
        true // enableMiscue: detects extra/missing words
      );
      pronConfig.applyTo(recognizer);

      recognizer.recognizeOnceAsync(
        (r) => {
          if (r.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
            const pa = SpeechSDK.PronunciationAssessmentResult.fromResult(r);
            const words: WordScore[] = (pa.detailResult?.Words || []).map((w) => ({
              word: w.Word,
              accuracy: Math.round(w.PronunciationAssessment?.AccuracyScore ?? 0),
              errorType: w.PronunciationAssessment?.ErrorType ?? "None",
            }));

            setResult({
              recognizedText: r.text,
              accuracy: Math.round(pa.accuracyScore),
              fluency: Math.round(pa.fluencyScore),
              completeness: Math.round(pa.completenessScore),
              pronScore: Math.round(pa.pronunciationScore),
              words,
            });
            setStatus("");
          } else if (r.reason === SpeechSDK.ResultReason.NoMatch) {
            setStatus("Didn't catch that — please try again.");
          } else {
            setStatus("Could not recognize speech. Try again.");
          }
          recognizer.close();
          recognizerRef.current = null;
          setBusy(false);
        },
        (err) => {
          setStatus("Error: " + err);
          recognizer.close();
          recognizerRef.current = null;
          setBusy(false);
        }
      );
    } catch (err) {
      setStatus("Error: " + (err as Error).message);
      setBusy(false);
    }
  }

  function nextWord() {
    setResult(null);
    setStatus("");
    setIndex((i) => (i + 1) % LESSON_WORDS.length);
  }

  // ---- Helpers for display ----
  const scoreColor = (s: number) =>
    s >= 80 ? "#22c55e" : s >= 60 ? "#eab308" : "#ef4444";

  // Did the learner say the right word at all? Normalize both sides so
  // "Happy.", "happy" or "I said happy" all count as a match.
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim();
  const spokenMatches =
    !!result &&
    (normalize(result.recognizedText) === normalize(currentWord) ||
      normalize(result.recognizedText).split(" ").includes(normalize(currentWord)));

  // 1–5 rating combining meaning (right word) and pronunciation quality.
  const rating = result ? starRating(spokenMatches, result.pronScore) : 0;

  return (
    <div className="container">
      <h1>🗣️ Pronunciation Practice</h1>
      <p className="subtitle">
        Say the word — Azure scores how close your pronunciation is.
      </p>

      <div className="card">
        <p className="status">
          Word {index + 1} of {LESSON_WORDS.length}
        </p>
        <div className="target-word">{currentWord}</div>

        <div className="btn-row">
          <button onClick={playReference} disabled={busy}>
            🔊 Hear it
          </button>
          <button onClick={startAssessment} disabled={busy}>
            {busy ? "Listening…" : "🎤 Say it"}
          </button>
          <button onClick={nextWord} disabled={busy} className="ghost">
            Next word →
          </button>
        </div>

        {status && <p className="status">{status}</p>}

        {result && (
          <div className="result">
            <p>
              You said: <strong>&quot;{result.recognizedText || "—"}&quot;</strong>{" "}
              {spokenMatches ? "✅" : "❌ (expected “" + currentWord + "”)"}
            </p>

            <div className="big-score" style={{ color: ratingColor(rating) }}>
              {"★".repeat(rating)}
              <span className="star-dim">{"★".repeat(5 - rating)}</span>
            </div>
            <p className="verdict" style={{ color: ratingColor(rating) }}>
              {rating}/5 — {RATING_LABELS[rating]}
            </p>

            <div className="score-grid">
              <ScoreBar label="Accuracy" value={result.accuracy} color={scoreColor} />
              <ScoreBar label="Fluency" value={result.fluency} color={scoreColor} />
              <ScoreBar label="Completeness" value={result.completeness} color={scoreColor} />
            </div>

            {result.words.length > 0 && (
              <div className="word-breakdown">
                <p className="status">Per-word:</p>
                {result.words.map((w, i) => (
                  <span
                    key={i}
                    className="word-chip"
                    style={{ borderColor: scoreColor(w.accuracy) }}
                    title={w.errorType}
                  >
                    {w.word} · {w.accuracy}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="status">
        <a href="/" style={{ color: "#60a5fa" }}>
          ← Back to TTS / STT
        </a>
      </p>

      <style>{`
        .target-word {
          font-size: 2.5rem;
          font-weight: 700;
          text-align: center;
          padding: 1.5rem 0;
          letter-spacing: 0.02em;
        }
        .btn-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        button.ghost { background: transparent; border: 1px solid #475569; }
        button.ghost:hover:not(:disabled) { background: #334155; }
        .big-score {
          font-size: 3.5rem; font-weight: 800; text-align: center;
          margin-top: 0.5rem; line-height: 1;
        }
        .score-max { font-size: 1.25rem; color: #64748b; font-weight: 500; }
        .star-dim { color: #334155; }
        .verdict { text-align: center; font-weight: 600; margin: 0.25rem 0 1rem; }
        .score-grid { display: flex; flex-direction: column; gap: 0.6rem; }
        .bar-wrap { }
        .bar-label { display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.2rem; }
        .bar-track { height: 8px; background: #0f172a; border-radius: 4px; overflow: hidden; }
        .bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s; }
        .word-breakdown { margin-top: 1rem; display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
        .word-chip {
          font-size: 0.85rem; padding: 0.2rem 0.6rem; border-radius: 999px;
          border: 1.5px solid; background: #0f172a;
        }
      `}</style>
    </div>
  );
}

function ScoreBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: (v: number) => string;
}) {
  return (
    <div className="bar-wrap">
      <div className="bar-label">
        <span>{label}</span>
        <span style={{ color: color(value) }}>{value}</span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${value}%`, background: color(value) }} />
      </div>
    </div>
  );
}
