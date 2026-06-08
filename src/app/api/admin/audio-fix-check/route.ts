import { NextResponse } from 'next/server';

/**
 * Diagnostic endpoint to check if audio fix endpoint exists and env vars are set
 */
export async function GET() {
  try {
    const checks = {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅' : '❌',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌',
      nodeEnv: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      message: 'Audio fix diagnostic endpoint is working',
      environment: checks,
      note: 'If serviceRoleKey is ❌, the audio fix endpoint will not work',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
