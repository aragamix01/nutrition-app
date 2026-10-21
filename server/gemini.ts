// Gemini call for food photos: prompt, JSON schema, and validation of the reply.
import { ApiError, GoogleGenAI } from '@google/genai';
import { z } from 'zod';

export const AiIngredient = z.object({
  name_th: z.string().min(1),
  usda_query: z.string().default(''),
  thai_query: z.string().default(''),
  grams: z.number().min(0).max(3000),
});

export const AiDish = z.object({
  name_th: z.string().min(1),
  matched_dish_id: z.number().int().nullable().default(null),
  portion_multiplier: z.number().min(0.1).max(10).default(1),
  est_total_g: z.number().min(0).max(5000).nullable().default(null),
  ingredients: z.array(AiIngredient).max(12).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
});

export const AiResult = z.object({
  dishes: z.array(AiDish).max(6),
  notes: z.string().default(''),
});
export type AiResult = z.infer<typeof AiResult>;

/** Sent as responseJsonSchema so the model can only answer in this shape. */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    dishes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name_th: { type: 'string' },
          matched_dish_id: { type: ['integer', 'null'] },
          portion_multiplier: { type: 'number' },
          est_total_g: { type: 'number' },
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name_th: { type: 'string' },
                usda_query: { type: 'string' },
                thai_query: { type: 'string' },
                grams: { type: 'number' },
              },
              required: ['name_th', 'usda_query', 'thai_query', 'grams'],
            },
          },
          confidence: { type: 'number' },
        },
        required: ['name_th', 'matched_dish_id', 'portion_multiplier', 'ingredients', 'confidence'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['dishes', 'notes'],
};

export type LibraryHint = { id: number; nameTh: string; aliases: string[] };

export function buildPrompt(library: LibraryHint[]): string {
  const menu = library.length
    ? library.map((d) => `- id ${d.id}: ${[d.nameTh, ...d.aliases].join(' / ')}`).join('\n')
    : '(ยังไม่มี)';
  return `คุณเป็นนักโภชนาการที่ประเมินอาหารไทยจากรูปถ่าย

งาน:
1. ระบุทุกจาน/เครื่องดื่มในรูป
2. ถ้าจานตรงกับเมนูใน "คลังของผู้ใช้" ด้านล่าง ให้ใส่ matched_dish_id เป็น id นั้น และประเมิน portion_multiplier เทียบกับ 1 ที่ปกติ (เช่น 1.5 ถ้าดูเยอะกว่าปกติครึ่งหนึ่ง) ถ้าไม่ตรงให้ใส่ null
3. แตกแต่ละจานเป็นวัตถุดิบหลักที่มีผลต่อพลังงาน (ข้าว/เส้น เนื้อสัตว์ ไข่ ผัก น้ำมัน น้ำตาล กะทิ ซอส) ไม่เกิน 8 รายการต่อจาน
4. ประเมินกรัมของแต่ละวัตถุดิบจากขนาดภาชนะในรูป (กรัมของส่วนที่กินได้ ในสภาพที่เห็น เช่นข้าวสุก)
5. ต้องใส่น้ำมัน น้ำตาล และกะทิที่ใช้ปรุงตามแบบร้านอาหารไทยทั่วไปเสมอ แม้จะมองไม่เห็นในรูป
6. usda_query เป็นคำค้นภาษาอังกฤษแบบชื่อใน USDA FoodData Central และต้องระบุสถานะสุก/ดิบ เช่น "rice white cooked", "pork ground cooked", "oil vegetable"
7. thai_query เป็นชื่อภาษาอังกฤษสั้นๆ แบบ Thai Food Composition Database เช่น "rice, cooked"
8. confidence 0–1 คือความมั่นใจของการประเมินจานนั้น
9. notes: สิ่งที่มองไม่เห็นแต่สมมติไว้ (เช่น น้ำมันที่ใช้ผัด) เป็นภาษาไทยสั้นๆ

คลังของผู้ใช้:
${menu}

ตอบเป็น JSON ตาม schema เท่านั้น ห้ามมีข้อความอื่น ถ้าในรูปไม่มีอาหาร ให้ dishes เป็น [] และอธิบายใน notes`;
}

export class AiUnavailableError extends Error {
  constructor(
    message: string,
    public status: 429 | 502 | 503 | 504,
  ) {
    super(message);
  }
}

export type ModelCall = (
  image: { data: string; mimeType: string },
  prompt: string,
) => Promise<string>;

/** Real Gemini call. Errors become AiUnavailableError so the UI can fall back to manual entry. */
export const callGemini: ModelCall = async (image, prompt) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model)
    throw new AiUnavailableError('ยังไม่ได้ตั้งค่า GEMINI_API_KEY / GEMINI_MODEL', 503);

  const ai = new GoogleGenAI({ apiKey });
  try {
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ inlineData: image }, { text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMA,
        temperature: 0.2,
        abortSignal: AbortSignal.timeout(25_000),
      },
    });
    return res.text ?? '';
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) {
      throw new AiUnavailableError('AI ใช้เกินโควตาฟรีแล้ว ลองใหม่ภายหลังหรือกรอกเอง', 429);
    }
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new AiUnavailableError('AI ตอบช้าเกินไป ลองใหม่หรือกรอกเอง', 504);
    }
    console.error('gemini error', err);
    throw new AiUnavailableError('เรียก AI ไม่สำเร็จ ลองใหม่หรือกรอกเอง', 502);
  }
};

/** Dev-only canned answer (GEMINI_MOCK=true) to try the photo flow without a key. */
export const mockGemini: ModelCall = async () =>
  JSON.stringify({
    dishes: [
      {
        name_th: 'ข้าวกะเพราหมูสับไข่ดาว',
        matched_dish_id: null,
        portion_multiplier: 1,
        est_total_g: 380,
        ingredients: [
          {
            name_th: 'ข้าวสวย',
            usda_query: 'rice white cooked',
            thai_query: 'rice, cooked',
            grams: 180,
          },
          {
            name_th: 'หมูสับ',
            usda_query: 'pork ground cooked',
            thai_query: 'pork, minced',
            grams: 80,
          },
          { name_th: 'ไข่ดาว', usda_query: 'egg whole fried', thai_query: 'egg, fried', grams: 50 },
          {
            name_th: 'น้ำมันพืช (ผัด+ทอดไข่)',
            usda_query: 'oil vegetable',
            thai_query: 'oil, vegetable',
            grams: 15,
          },
          {
            name_th: 'ซอสหอยนางรม',
            usda_query: 'sauce oyster',
            thai_query: 'oyster sauce',
            grams: 10,
          },
          { name_th: 'ผงชูรส', usda_query: 'monosodium glutamate', thai_query: 'msg', grams: 1 },
        ],
        confidence: 0.7,
      },
    ],
    notes: 'สมมติน้ำมันผัดและทอดไข่ประมาณ 1 ช้อนโต๊ะ (mock)',
  });

/** Parses the model's JSON reply; a malformed reply is an upstream failure, not a client error. */
export function parseAiResult(text: string): AiResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiUnavailableError('AI ตอบกลับในรูปแบบที่อ่านไม่ได้ ลองใหม่หรือกรอกเอง', 502);
  }
  const parsed = AiResult.safeParse(json);
  if (!parsed.success) throw new AiUnavailableError('AI ตอบกลับไม่ครบ ลองใหม่หรือกรอกเอง', 502);
  return parsed.data;
}
