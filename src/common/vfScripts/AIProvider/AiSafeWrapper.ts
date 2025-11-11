import { CacheManager } from "../utils/cacheManager.js";

let aiDisabled = false;

export async function safeAiCall<T>(
  cacheManager: CacheManager,
  cacheKey: string,
  aiCall: () => Promise<T>,
  defaultValue: T,
  options: { maxRetries?: number; retryDelay?: number } = {}
): Promise<T> {
  const { maxRetries = 3, retryDelay = 1000 } = options;

  // 1️⃣ Check global AI disable
  if (aiDisabled) {
    console.log(`⚙️ AI disabled — using cache for ${cacheKey}`);
    return cacheManager.get(cacheKey) || defaultValue;
  }

  // 2️⃣ Use cache if available
  const cached = cacheManager.get(cacheKey);
  if (cached) return cached;

  // 3️⃣ Retry logic with exponential backoff
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await aiCall();
      if (result) {
        cacheManager.set(cacheKey, result);
        cacheManager.save();
        return result;
      }
      console.warn(`⚠️ AI returned empty for ${cacheKey}, attempt ${attempt}/${maxRetries}`);
    } catch (err: any) {
      const message = err?.message || "";
      const status = err?.response?.status;

      if (status === 401 || /unauthorized/i.test(message)) {
        console.error(`🔒 Unauthorized (401): Invalid API key — disabling AI.`);
        aiDisabled = true;
        break;
      }

      if (status === 429 || /rate/i.test(message) || /timeout/i.test(message)) {
        const delay = retryDelay * Math.pow(2, attempt - 1) + Math.random() * 500;
        console.warn(`⏳ Retry ${attempt}/${maxRetries} after ${delay.toFixed(0)}ms (reason: ${message})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      console.warn(`❌ AI call failed (${message}) — attempt ${attempt}/${maxRetries}`);
    }
  }

  // 4️⃣ Fallback to cache or default
  console.warn(`⚠️ All AI attempts failed for ${cacheKey}. Using cache or default.`);
  return cacheManager.get(cacheKey) || defaultValue;
}
