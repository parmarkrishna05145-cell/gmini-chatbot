import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Helper to format error messages nicely
function cleanErrorMessage(err: any): string {
  if (err?.message) {
    try {
      const parsed = JSON.parse(err.message);
      if (parsed?.error?.message) {
        return parsed.error.message;
      }
    } catch {
      // Message was not JSON
    }
    return err.message;
  }
  return 'The AI assistant is temporarily unavailable. Please try again.';
}

// Audio Transcription API endpoint
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audioData, mimeType } = req.body;

    if (!audioData) {
      return res.status(400).json({ error: 'Audio data is required for transcription.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key is not configured.' });
    }

    const audioPart = {
      inlineData: {
        mimeType: mimeType || 'audio/webm',
        data: audioData,
      },
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          audioPart,
          { text: 'Transcribe this student study question clearly and verbatim. Return only the transcription without filler.' },
        ],
      },
    });

    const transcript = response.text?.trim() || '';
    return res.json({ transcript });
  } catch (error: any) {
    console.error('Transcription error:', error);
    return res.status(500).json({ error: cleanErrorMessage(error) });
  }
});

// Study Assistant API endpoint with optional Search Grounding
app.post('/api/ask', async (req, res) => {
  try {
    const { question, useSearch } = req.body;

    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'Please provide a valid question.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Gemini API key is not configured. Please ensure GEMINI_API_KEY is set in your environment.',
      });
    }

    const systemInstruction =
      'You are an expert AI Study Assistant designed to help students learn effectively. ' +
      'Provide clear, well-structured, and encouraging explanations. ' +
      'Break down complex topics into simple steps, use clear headings, bullet points, and practical examples when helpful. ' +
      'Keep the tone supportive, concise, and easy to follow.';

    // If Search Grounding is requested, use gemini-3.5-flash with googleSearch tool
    if (useSearch) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: question.trim(),
          config: {
            systemInstruction,
            tools: [{ googleSearch: {} }],
          },
        });

        const answer = response.text || 'I could not generate an answer with search grounding. Please try again.';
        const searchChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const sources = searchChunks
          .map((chunk: any) => chunk?.web)
          .filter((web: any) => web && web.uri)
          .map((web: any) => ({ title: web.title || web.uri, uri: web.uri }));

        return res.json({ answer, sources });
      } catch (searchErr) {
        console.warn('Search grounding model failed, falling back to standard models:', searchErr);
      }
    }

    // List of candidate models for resilience during high demand spikes
    const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
    let lastError: any = null;
    let answer: string | null = null;

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: question.trim(),
          config: { systemInstruction },
        });

        if (response.text) {
          answer = response.text;
          break;
        }
      } catch (err: any) {
        console.warn(`Model ${model} failed, attempting next model if available:`, err?.message || err);
        lastError = err;
      }
    }

    if (!answer && lastError) {
      throw lastError;
    }

    return res.json({
      answer: answer || 'I could not generate an explanation for that question. Please try rephrasing.',
    });
  } catch (error: any) {
    console.error('Error querying Gemini:', error);
    const userMessage = cleanErrorMessage(error);
    return res.status(500).json({ error: userMessage });
  }
});

// Mount Vite middleware in development or serve static files in production
async function setupServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

setupServer().catch((err) => {
  console.error('Failed to start server:', err);
});
