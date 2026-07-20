# 🎙️ Speech App — Azure TTS & STT

A Next.js app with **Text-to-Speech** and **Speech-to-Text**, powered by
**Azure Cognitive Services (Speech)**.

## How it works (architecture)

```
Browser (page.tsx)                    Your server (Next.js)         Azure
─────────────────                     ─────────────────────        ─────
1. Ask for a token  ───────────────►  /api/token
                                       exchanges secret KEY  ─────► issueToken
2. Gets short-lived token  ◄────────  returns token (no key!) ◄───  token
3. Speech SDK talks to Azure directly using that token  ──────────► TTS / STT
```

**Key idea:** your `AZURE_SPEECH_KEY` never leaves the server. The browser only
ever receives a short-lived (~10 min) token. This is the secure, recommended
pattern.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Add your Azure credentials.** Copy the example env file and fill it in:
   ```bash
   cp .env.example .env.local
   ```
   Then edit `.env.local`:
   ```
   AZURE_SPEECH_KEY=<your key from Azure Portal>
   AZURE_SPEECH_REGION=southeastasia
   ```
   Get these from **Azure Portal → your Speech resource → "Keys and Endpoint"**.
   Use the **region name** (`southeastasia`), not the full URL.

3. **Run it**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

## Using it

- **Text → Speech:** type text, pick a voice, click *Speak*. Audio plays and is
  downloadable.
- **Speech → Text:** click *Start recording*, allow mic access, speak. Your words
  appear live. Click *Stop* when done.

> Note: speech-to-text needs microphone permission, which browsers only grant on
> `localhost` or `https`. `npm run dev` on localhost works fine.

## Files that matter

| File | What it does |
|------|--------------|
| `src/app/api/token/route.ts` | Server endpoint that safely issues Azure tokens |
| `src/app/page.tsx` | The whole UI + TTS/STT logic |
| `.env.local` | Your secret Azure key (never commit this) |

## Changing languages / voices

- **TTS voices:** edit the `VOICES` array in `src/app/page.tsx`.
- **STT language:** change `speechRecognitionLanguage = "en-US"` in `page.tsx`
  (e.g. `"my-MM"` for Burmese).
- Full list: https://learn.microsoft.com/azure/ai-services/speech-service/language-support
