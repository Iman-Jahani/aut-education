import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_HINTS_PER_DAY = 10;
const MIN_SECONDS_BETWEEN = 30;

// Free models, tried in order. An env pin (OPENROUTER_MODEL) goes first;
// the rest cycles through proven `:free` models so a 429 or a retired id on
// one model never blocks the student.
const FREE_MODELS: string[] = [
  ...(process.env.OPENROUTER_MODEL ? [process.env.OPENROUTER_MODEL] : []),
  'deepseek/deepseek-chat-v3.1:free',
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'mistralai/mistral-small-3.2-24b-instruct:free',
  'nvidia/nemotron-3.5-lightning:free',
];

/** Cookie-based Supabase client for this route handler (read-only cookies). */
function serverSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );
}


export async function POST(req: NextRequest) {
  try {
    // ۱. احراز هویت
    const supabase = serverSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
    }

    // ۲. Rate limit — تعداد در روز
    const { data: todayCount } = await supabase
      .rpc('count_ai_hints_today', { p_user_id: user.id });

    if ((todayCount ?? 0) >= MAX_HINTS_PER_DAY) {
      return NextResponse.json(
        { error: `سقف ${MAX_HINTS_PER_DAY} راهنمایی در ۲۴ ساعت پر شده. بعداً برگرد.` },
        { status: 429 }
      );
    }

    // ۳. Rate limit — فاصله بین دو درخواست
    const { data: lastAt } = await supabase
      .rpc('last_ai_hint_at', { p_user_id: user.id });

    if (lastAt) {
      const seconds = (Date.now() - new Date(lastAt).getTime()) / 1000;
      if (seconds < MIN_SECONDS_BETWEEN) {
        const wait = Math.ceil(MIN_SECONDS_BETWEEN - seconds);
        return NextResponse.json(
          { error: `لطفاً ${wait} ثانیه صبر کن.` },
          { status: 429 }
        );
      }
    }

    // ۴. بدنه
    const body = await req.json();
    const { exercise_id, code, user_message } = body as {
      exercise_id: string;
      code: string;
      user_message?: string;
    };

    if (!exercise_id || typeof code !== 'string') {
      return NextResponse.json({ error: 'درخواست نامعتبر' }, { status: 400 });
    }

    // ۵. اطلاعات تمرین
    const { data: exercise, error: exErr } = await supabase
      .from('exercises')
      .select('id, title, description, hint, test_cases, class_id')
      .eq('id', exercise_id)
      .single();

    if (exErr || !exercise) {
      return NextResponse.json({ error: 'تمرین پیدا نشد' }, { status: 404 });
    }

    // ۶. پرامپت
    // const systemPrompt = [
    //   'تو یه معلم پایتون برای دانشجوهای مبتدی هستی.',
    //   'وظیفته راهنمایی کنی، نه اینکه جواب کامل بده.',
    //   '',
    //   'قوانین مهم:',
    //   '- فارسی جواب بده',
    //   '- کوتاه باش (حداکثر ۳ جمله)',
    //   '- اگه کد دانشجو باگ داره، فقط به خط یا ناحیه‌اش اشاره کن، چگونگی حل رو نگو',
    //   '- اگه نیاز به مفهوم جدید داره، اسمش رو بگو و یه مثال کوچیک بی‌ربط بزن',
    //   '- اگه کد ناقصه، بگو کدوم قسمت رو ادامه بده',
    //   '- هرگز کد کامل یا کد قابل کپی نده',
    //   '- لحنت دوستانه و تشویق‌کننده باشه',
    //   '- اگه دانشجو مستقیم جواب خواست، مؤدبانه بگو باید خودش تلاش کنه',
    // ].join('\n');
    const systemPrompt = [
      'تو یه معلم پایتون برای دانشجوی مبتدی هستی.',
      'مهم: هرگز فرآیند فکر کردن یا reasoning یا تحلیل خودت رو ننویس.',
      'فقط جواب نهایی رو بنویس.',
      '',
      'قوانین:',
      '- فارسی جواب بده',
      '- حداکثر ۳ جمله',
      '- اگه باگ داره، فقط به خطش اشاره کن',
      '- هرگز کد کامل نده',
      '- لحنت دوستانه و تشویق‌کننده',
    ].join('\n');

    const testCases = Array.isArray(exercise.test_cases) 
      ? exercise.test_cases.slice(0, 5) 
      : [];

    const userPrompt = [
      '**صورت سوال:**',
      exercise.description || exercise.title,
      '',
      exercise.hint ? `**راهنمایی معلم:**\n${exercise.hint}\n` : '',
      '**نمونه تست‌کیس‌ها:**',
      JSON.stringify(testCases, null, 2),
      '',
      '**کد فعلی دانشجو:**',
      '```python',
      code || '(خالی)',
      '```',
      '',
      user_message ? `**سوال دانشجو:**\n${user_message}\n` : '',
      'حالا راهنمایی کن.',
    ].filter(Boolean).join('\n');

    // ۷. فراخوانی OpenRouter
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'سرویس AI تنظیم نشده. با معلم تماس بگیر.' },
        { status: 500 }
      );
    }

    const origin = req.headers.get('origin') ?? 'https://aut-education.vercel.app';
    const callModel = (model: string) =>
      fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': origin,
          'X-Title': 'Python Class Notebook',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 800,
          temperature: 0.7,
          reasoning: { 
          enabled: false,   // ← خاموش کردن thinking
          exclude: true,    // ← حذف از خروجی
          },
        }),
      });

    // Try the free models in order: a 429 (or a retired id) just moves on to
    // the next one — the student never sees a per-model rate limit.
    let aiResponse = '';
    let lastError = '';
    let usedModel = '';

    for (const model of FREE_MODELS) {
      try {
        const res = await callModel(model);
        if (res.status === 429) {
          let note = '';
          try {
            note = (await res.text()).slice(0, 160);
          } catch {
            /* ignore — body already consumed or empty */
          }
          lastError = `${model} rate limited${note ? ` — ${note}` : ''}`;
          continue;
        }
        if (!res.ok) {
          const errText = await res.text();
          lastError = `${model}: HTTP ${res.status} — ${errText.slice(0, 160)}`;
          continue;
        }
        const json = await res.json();
        const text: string = json?.choices?.[0]?.message?.content?.trim() ?? '';
        if (text) {
          aiResponse = text;
          usedModel = model;
          break;
        }
        lastError = `${model}: empty answer`;
      } catch (err) {
        lastError = `${model}: ${err instanceof Error ? err.message : 'network error'}`;
      }
    }

    if (!aiResponse) {
      console.error('OpenRouter: all models failed. Last error:', lastError);
      // `detail` is only used by non-production builds (see ExerciseSolveModal).
      return NextResponse.json(
        {
          error: 'همه‌ی مدل‌ها الان شلوغن. چند لحظه دیگه امتحان کن.',
          detail: lastError.slice(0, 300),
        },
        { status: 503 }
      );
    }

    console.log('AI hint used model:', usedModel);

    // ۸. ذخیره
    const { error: insErr } = await supabase.from('ai_hint_requests').insert({
      user_id: user.id,
      exercise_id,
      code,
      user_message: user_message || null,
      ai_response: aiResponse,
    });

    if (insErr) console.error('Insert error:', insErr, '(did you run supabase/AI_TUTOR.sql?)');

    // ۹. برگردون
    return NextResponse.json({
      response: aiResponse,
      remaining: Math.max(0, MAX_HINTS_PER_DAY - ((todayCount ?? 0) + 1)),
      model: usedModel,
    });
  } catch (err) {
    console.error('ai-hint error:', err);
    return NextResponse.json(
      { error: 'خطای غیرمنتظره. لطفاً بعداً تلاش کن.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai-hint?exercise_id=… → the signed-in user's last 10 hints for that
 * exercise (powers the «سابقه» button in ExerciseSolveModal).
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = serverSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ hints: [] }, { status: 401 });

    const exerciseId = req.nextUrl.searchParams.get('exercise_id');
    if (!exerciseId) return NextResponse.json({ hints: [] });

    const { data, error } = await supabase
      .from('ai_hint_requests')
      .select('id, ai_response, user_message, created_at')
      .eq('user_id', user.id)
      .eq('exercise_id', exerciseId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      // Usually means supabase/AI_TUTOR.sql has not been applied yet.
      console.error('ai-hint history error:', error.message);
      return NextResponse.json({ hints: [] });
    }
    return NextResponse.json({ hints: data ?? [] });
  } catch (err) {
    console.error('ai-hint GET error:', err);
    return NextResponse.json({ hints: [] });
  }
}