/**
 * Buddy Insight API Route
 * Generates AI-powered personalized insights from test scores using Claude API
 * Called when student completes CAT Readiness Test
 */

import { NextRequest, NextResponse } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface BuddyInsightRequest {
  score: number; // 0-100
  percentile: number; // 0-100
  categoryBreakdown: {
    [key: string]: number; // Category name -> percentage score
  };
  daysToCAT: number;
  testAttemptId?: string; // For caching
}

interface BuddyInsightResponse {
  insight: string;
  cached: boolean;
}

// In-memory cache for buddy insights (in production, use Redis)
const insightCache = new Map<string, string>();

const client = new Anthropic();

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('buddy-insight: ANTHROPIC_API_KEY is not set in this environment');
      return NextResponse.json(
        { error: 'AI is not configured on the server — add ANTHROPIC_API_KEY in Vercel project settings' },
        { status: 503 }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'student') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: BuddyInsightRequest = await request.json();

    // Validate input
    if (
      body.score === undefined ||
      body.percentile === undefined ||
      !body.categoryBreakdown ||
      body.daysToCAT === undefined
    ) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check cache
    const cacheKey = body.testAttemptId || `${body.score}-${body.percentile}`;
    if (insightCache.has(cacheKey)) {
      return NextResponse.json({
        insight: insightCache.get(cacheKey),
        cached: true
      } as BuddyInsightResponse);
    }

    // Build category breakdown string
    const categoryStr = Object.entries(body.categoryBreakdown)
      .map(([name, score]) => `${name}: ${Math.round(score)}%`)
      .join(', ');

    // Create Claude prompt
    const systemPrompt = `You are an IIM alumni buddy reviewing a CAT aspirant's readiness test score. Your tone is direct, warm, and encouraging—like a senior bhaiya/behen giving genuine advice.

Write exactly 3 sentences:
1. One honest, specific observation about their strongest category (mention which category)
2. One honest, specific observation about their weakest category (mention which category)
3. One specific, actionable step they should take THIS WEEK to improve

Use first-person as if you're the buddy ("I see...", "I'd focus on..."). Be specific to their actual numbers. No generic platitudes. Keep it under 80 words total.`;

    const userMessage = `Student's CAT Readiness Test Results:
- Score: ${body.score}/100
- Percentile: ${body.percentile}%
- Category breakdown: ${categoryStr}
- Days until CAT exam: ${body.daysToCAT}

Based on this data, give your honest buddy advice.`;

    // Call Claude API
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ]
    });

    // Extract text response
    const insight = message.content[0].type === 'text' ? message.content[0].text : '';

    // Cache the insight
    insightCache.set(cacheKey, insight);

    return NextResponse.json({
      insight,
      cached: false
    } as BuddyInsightResponse);
  } catch (error) {
    console.error('Error generating buddy insight:', error);

    // Fallback generic insight if API fails
    const fallbackInsight =
      "Great effort on taking this test! Your buddy will review your specific scores and share personalized feedback soon. Keep practicing and stay focused on your weaker areas.";

    return NextResponse.json({
      insight: fallbackInsight,
      cached: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Clear cache endpoint (admin only)
 */
export async function DELETE(_request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    insightCache.clear();
    return NextResponse.json({ message: 'Cache cleared' });
  } catch {
    return NextResponse.json({ error: 'Cache clear failed' }, { status: 500 });
  }
}
