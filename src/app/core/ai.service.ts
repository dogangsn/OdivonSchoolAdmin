import { Injectable, inject, signal } from '@angular/core';
import { Firestore, addDoc, collection } from '@angular/fire/firestore';
import { Question } from '../models/question';
import { TestCategory } from '../models/test-category';
import { buildQuestionPrompt } from './question-prompt';

const API_KEY_STORAGE_KEY = 'odivon_gemini_api_key';
export const GEMINI_MODEL = 'gemini-3.8-flash';

interface GeneratedItem {
  prompt: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
  difficulty: number;
  outcomeCode?: string;
}

/**
 * Gemini question generation (moved from the main app's /yonetim). The API
 * key stays in this browser only; generated questions are saved as drafts
 * (reviewStatus 'draft', source 'ai-generated') for the Soru Onayı page.
 */
@Injectable({ providedIn: 'root' })
export class AiService {
  private fs = inject(Firestore);
  apiKey = signal<string>(this.load());

  private load(): string {
    try {
      return localStorage.getItem(API_KEY_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  setApiKey(key: string) {
    const k = key.trim();
    this.apiKey.set(k);
    try {
      if (k) localStorage.setItem(API_KEY_STORAGE_KEY, k);
      else localStorage.removeItem(API_KEY_STORAGE_KEY);
    } catch {}
  }

  private url(key: string) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  }

  async testApiKey(key: string): Promise<{ ok: boolean; message: string }> {
    const k = key.trim();
    if (!k) return { ok: false, message: 'Lütfen bir Gemini API anahtarı girin.' };
    try {
      const res = await fetch(this.url(k), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Ping. Sadece "OK" yanıtı ver.' }] }] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, message: `Geçersiz API anahtarı: ${err?.error?.message || 'HTTP ' + res.status}` };
      }
      return { ok: true, message: 'API anahtarı doğrulandı, Gemini hazır.' };
    } catch (e: any) {
      return { ok: false, message: `Bağlantı hatası: ${e?.message ?? ''}` };
    }
  }

  async generate(category: TestCategory, count = 5, difficulty = 2, subTopic?: string): Promise<Question[]> {
    const key = this.apiKey();
    if (!key) throw new Error('Gemini API anahtarı yok. Önce anahtarı girin.');
    const n = Math.min(Math.max(count, 1), 15);
    const res = await fetch(this.url(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildQuestionPrompt(category, n, difficulty, subTopic) }] }],
        generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) throw new Error(`Gemini API hatası (${res.status}): ${await res.text()}`);
    const data = await res.json();
    let text: string = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
    if (!text) throw new Error('Gemini boş yanıt döndürdü.');
    text = text.replace(/^```(json)?\s*/, '').replace(/\s*```$/, '');
    let parsed: any;
    try {
      parsed = JSON.parse(text);
      if (!Array.isArray(parsed) && Array.isArray(parsed?.questions)) parsed = parsed.questions;
    } catch {
      throw new Error('Yapay zekâ yanıtı geçerli JSON değil.');
    }
    const items = this.validate(parsed);
    const out: Question[] = [];
    for (const item of items) {
      const d = Math.min(Math.max(item.difficulty || difficulty || 2, 1), 5) as Question['difficulty'];
      const q: Omit<Question, 'id'> = {
        categoryId: category.id,
        level: category.level,
        subject: category.subject,
        prompt: item.prompt,
        options: item.options,
        correctOptionId: item.correctOptionId,
        explanation: item.explanation,
        difficulty: d,
        ...(item.outcomeCode && category.outcomes?.some((o) => o.code === item.outcomeCode) ? { outcomeCode: item.outcomeCode } : {}),
        source: 'ai-generated',
        aiModel: GEMINI_MODEL,
        reviewStatus: 'draft',
        createdAt: Date.now(),
        usageCount: 0,
        correctCount: 0,
      };
      const ref = await addDoc(collection(this.fs, 'questions'), q);
      out.push({ id: ref.id, ...q });
    }
    return out;
  }

  private validate(items: unknown): GeneratedItem[] {
    if (!Array.isArray(items)) throw new Error('Yapay zekâ yanıtı bir liste değil.');
    return items.map((raw, i) => {
      const q = raw as GeneratedItem;
      if (!q.prompt || typeof q.prompt !== 'string') throw new Error(`${i + 1}. sorunun metni eksik.`);
      if (!Array.isArray(q.options) || q.options.length !== 4) throw new Error(`${i + 1}. soruda tam 4 şık olmalı.`);
      q.correctOptionId = (q.correctOptionId || '').toLowerCase().trim();
      q.options = q.options.map((o) => ({ id: (o.id || '').toLowerCase().trim(), text: (o.text || '').trim() }));
      if (!q.options.some((o) => o.id === q.correctOptionId)) throw new Error(`${i + 1}. sorunun doğru şıkkı listede yok.`);
      if (!q.explanation || typeof q.explanation !== 'string') throw new Error(`${i + 1}. sorunun açıklaması eksik.`);
      return q;
    });
  }
}
