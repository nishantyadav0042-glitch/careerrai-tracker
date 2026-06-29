import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/audit';
import { normalizeIndianPhone } from '@/lib/phone';
import { NextRequest, NextResponse } from 'next/server';

interface ImportRow {
  full_name: string;
  email: string;
  phone: string;
  role: 'student' | 'buddy';
  exam_target?: string;
  buddy_email?: string;
  username?: string;
  password?: string;
}

interface ImportResult {
  success: boolean;
  summary: {
    total: number;
    created: number;
    failed: number;
  };
  created: Array<{ email: string; role: string; full_name: string }>;
  errors: Array<{ row: number; email: string; error: string }>;
  buddyErrors: Array<{ email: string; error: string }>;
}

// RFC 4180-compliant CSV line parser — handles quoted fields containing commas.
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } // escaped quote
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): ImportRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV must have header row + at least 1 data row');

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
  const requiredHeaders = ['full_name', 'email', 'phone', 'role'];

  for (const h of requiredHeaders) {
    if (!headers.includes(h)) {
      throw new Error(`Missing required column: ${h}`);
    }
  }

  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = parseCSVLine(lines[i]);

    // Helper to safely get value from headers
    const getValue = (colName: string) => {
      const idx = headers.indexOf(colName);
      return idx >= 0 ? values[idx] : undefined;
    };

    const row: ImportRow = {
      full_name: getValue('full_name') || '',
      email: getValue('email') || '',
      phone: getValue('phone') || '',
      role: (getValue('role') || '').toLowerCase() as 'student' | 'buddy',
      exam_target: getValue('exam_target') || undefined,
      buddy_email: getValue('buddy_email') || undefined,
      username: getValue('username') || undefined,
      password: getValue('password') || undefined,
    };

    rows.push(row);
  }
  return rows;
}

function validateRow(row: ImportRow, rowNum: number): string | null {
  if (!row.full_name) return `Row ${rowNum}: Missing full_name`;
  if (!row.email || !row.email.includes('@')) return `Row ${rowNum}: Invalid email`;
  // Normalize phone to E.164 in-place so the profile is always stored correctly.
  // Raw values like "9876543210" or "09876543210" are accepted and normalised;
  // anything that doesn't parse as a valid Indian mobile is rejected here.
  const e164 = normalizeIndianPhone(row.phone);
  if (!e164) return `Row ${rowNum}: Invalid phone '${row.phone}' — must be a 10-digit Indian mobile`;
  row.phone = e164;
  if (!['student', 'buddy'].includes(row.role)) return `Row ${rowNum}: Role must be 'student' or 'buddy'`;
  if (row.role === 'student' && !row.exam_target) return `Row ${rowNum}: Students must have exam_target (CAT)`;
  if (row.password && row.password.length < 8) return `Row ${rowNum}: Password must be at least 8 characters`;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('id', user.id).single();

    if (profileError) return NextResponse.json({ error: `Profile error: ${profileError.message}` }, { status: 403 });
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden - not an admin' }, { status: 403 });

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const text = await file.text();
    const rows = parseCSV(text);

    // Validate all rows first
    const errors: Array<{ row: number; email: string; error: string }> = [];
    const validRows: ImportRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const err = validateRow(rows[i], i + 2);
      if (err) {
        errors.push({ row: i + 2, email: rows[i].email, error: err });
      } else {
        validRows.push(rows[i]);
      }
    }

    // Check for duplicate emails in CSV
    const emails = validRows.map(r => r.email);
    const uniqueEmails = new Set(emails);
    if (emails.length !== uniqueEmails.size) {
      const dups = emails.filter((e, i) => emails.indexOf(e) !== i);
      return NextResponse.json(
        { error: `Duplicate emails in CSV: ${[...new Set(dups)].join(', ')}` },
        { status: 400 }
      );
    }

    const created: Array<{ email: string; role: string; full_name: string }> = [];
    const buddyMap = new Map<string, string>();

    // First pass: Create auth users OR update passwords
    for (const row of validRows) {
      try {
        // Check if profile already exists
        const { data: existingProfile } = await admin
          .from('profiles')
          .select('id')
          .eq('email', row.email)
          .maybeSingle();

        let userId: string;

        if (existingProfile) {
          userId = existingProfile.id;
          if (row.password) {
            const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
              password: row.password,
            });
            if (updateError) {
              errors.push({ row: 0, email: row.email, error: `Password update failed: ${updateError.message}` });
              continue;
            }
          }
        } else {
          // New user - create auth account
          // Use password from CSV if provided, otherwise generate temp password
          const userPassword = row.password || `CareerRai${Math.random().toString(36).slice(2, 10)}!`;

          const { data: { user: newUser }, error: authError } = await admin.auth.admin.createUser({
            email: row.email,
            password: userPassword,
            email_confirm: true,
            user_metadata: { full_name: row.full_name, phone: row.phone },
          });

          if (authError) {
            errors.push({ row: 0, email: row.email, error: `Auth error: ${authError.message}` });
            continue;
          }

          if (!newUser) {
            errors.push({ row: 0, email: row.email, error: 'Failed to create user' });
            continue;
          }

          userId = newUser.id;
        }

        // UPSERT profile (create if new, update if exists)
        const { error: upsertError } = await admin
          .from('profiles')
          .upsert(
            {
              id: userId,
              email: row.email,
              full_name: row.full_name,
              phone: row.phone,
              username: row.username || null,
              role: row.role,
              exam_target: row.exam_target || null,
              created_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );

        if (upsertError) {
          errors.push({ row: 0, email: row.email, error: `Profile error: ${upsertError.message}` });
          continue;
        }

        created.push({
          email: row.email,
          role: row.role,
          full_name: row.full_name,
        });

        if (row.role === 'buddy') {
          buddyMap.set(row.email, userId);
        }
      } catch (err) {
        errors.push({ row: 0, email: row.email, error: String(err) });
      }
    }

    // Second pass: Assign buddies to students
    const buddyErrors: Array<{ email: string; error: string }> = [];
    for (const row of validRows) {
      if (row.role === 'student' && row.buddy_email) {
        try {
          const buddyId = buddyMap.get(row.buddy_email);
          if (!buddyId) {
            buddyErrors.push({ email: row.email, error: `Buddy '${row.buddy_email}' not found in import` });
            continue;
          }

          const { data: studentData } = await admin
            .from('profiles')
            .select('id')
            .eq('email', row.email)
            .single();

          if (!studentData) {
            buddyErrors.push({ email: row.email, error: 'Could not find student record' });
            continue;
          }

          const { error: updateError } = await admin
            .from('profiles')
            .update({ buddy_id: buddyId })
            .eq('id', studentData.id);

          if (updateError) {
            buddyErrors.push({ email: row.email, error: `Update failed: ${updateError.message}` });
          }
        } catch (err) {
          buddyErrors.push({ email: row.email, error: String(err) });
        }
      }
    }

    const result: ImportResult = {
      success: true,
      summary: {
        total: rows.length,
        created: created.length,
        failed: errors.length,
      },
      created,
      errors,
      buddyErrors,
    };

    logAdminAction(user.id, 'bulk_import', 'users', null, {
      file: file.name,
      total: result.summary.total,
      created: result.summary.created,
      failed: result.summary.failed,
    });
    return NextResponse.json(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[BULK_IMPORT] Error:', errorMsg, err);
    return NextResponse.json(
      { error: `Import failed: ${errorMsg}` },
      { status: 500 }
    );
  }
}
