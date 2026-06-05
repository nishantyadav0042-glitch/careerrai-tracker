import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

interface ImportRow {
  full_name: string;
  email: string;
  phone: string;
  role: 'student' | 'buddy';
  exam_target?: string;
  buddy_email?: string;
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

function parseCSV(text: string): ImportRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV must have header row + at least 1 data row');

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const requiredHeaders = ['full_name', 'email', 'phone', 'role'];

  for (const h of requiredHeaders) {
    if (!headers.includes(h)) {
      throw new Error(`Missing required column: ${h}`);
    }
  }

  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue; // skip empty lines

    const values = lines[i].split(',').map(v => v.trim());
    const row: ImportRow = {
      full_name: values[headers.indexOf('full_name')] || '',
      email: values[headers.indexOf('email')] || '',
      phone: values[headers.indexOf('phone')] || '',
      role: (values[headers.indexOf('role')] || '').toLowerCase() as 'student' | 'buddy',
      exam_target: values[headers.indexOf('exam_target')] || undefined,
      buddy_email: values[headers.indexOf('buddy_email')] || undefined,
    };
    rows.push(row);
  }
  return rows;
}

function validateRow(row: ImportRow, rowNum: number): string | null {
  if (!row.full_name) return `Row ${rowNum}: Missing full_name`;
  if (!row.email || !row.email.includes('@')) return `Row ${rowNum}: Invalid email`;
  if (!row.phone) return `Row ${rowNum}: Missing phone`;
  if (!['student', 'buddy'].includes(row.role)) return `Row ${rowNum}: Role must be 'student' or 'buddy'`;
  if (row.role === 'student' && !row.exam_target) return `Row ${rowNum}: Students must have exam_target (CAT/CUET)`;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
    );

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Admin check
    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Parse request
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const text = await file.text();
    const rows = parseCSV(text);

    // Validate all rows first
    const errors: Array<{ row: number; email: string; error: string }> = [];
    const validRows: ImportRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const err = validateRow(rows[i], i + 2); // +2 because header is row 1, data starts at row 2
      if (err) {
        errors.push({ row: i + 2, email: rows[i].email, error: err });
      } else {
        validRows.push(rows[i]);
      }
    }

    // Check for duplicate emails
    const emails = validRows.map(r => r.email);
    const uniqueEmails = new Set(emails);
    if (emails.length !== uniqueEmails.size) {
      const dups = emails.filter((e, i) => emails.indexOf(e) !== i);
      return NextResponse.json(
        { error: `Duplicate emails in CSV: ${[...new Set(dups)].join(', ')}` },
        { status: 400 }
      );
    }

    // Check emails don't already exist in Supabase
    const { data: existingProfiles } = await admin
      .from('profiles')
      .select('email')
      .in('email', validRows.map(r => r.email));

    if ((existingProfiles?.length ?? 0) > 0) {
      const existing = existingProfiles!.map(p => p.email).join(', ');
      return NextResponse.json(
        { error: `These emails already exist: ${existing}` },
        { status: 400 }
      );
    }

    // Create users and profiles
    const created: Array<{ email: string; role: string; full_name: string }> = [];
    const buddyMap = new Map<string, string>(); // email -> id

    // First pass: Create all users and profiles, collect buddy IDs
    for (const row of validRows) {
      try {
        // Generate temp password
        const tempPassword = `CareerRai${Math.random().toString(36).slice(2, 10)}!`;

        // Create auth user
        const { data: { user: newUser }, error: authError } = await admin.auth.admin.createUser({
          email: row.email,
          password: tempPassword,
          email_confirm: true, // auto-confirm email
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

        // Create profile
        const { error: profileError } = await admin
          .from('profiles')
          .insert({
            id: newUser.id,
            email: row.email,
            full_name: row.full_name,
            phone: row.phone,
            role: row.role,
            exam_target: row.exam_target || null,
            created_at: new Date().toISOString(),
          });

        if (profileError) {
          // Rollback: delete auth user
          await admin.auth.admin.deleteUser(newUser.id);
          errors.push({ row: 0, email: row.email, error: `Profile error: ${profileError.message}` });
          continue;
        }

        created.push({
          email: row.email,
          role: row.role,
          full_name: row.full_name,
        });

        if (row.role === 'buddy') {
          buddyMap.set(row.email, newUser.id);
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

          // Find student ID from created list
          const studentProfile = created.find(c => c.email === row.email);
          if (!studentProfile) continue;

          const { data: studentData } = await admin
            .from('profiles')
            .select('id')
            .eq('email', row.email)
            .single();

          if (!studentData) {
            buddyErrors.push({ email: row.email, error: 'Could not find created student record' });
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

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: `Import failed: ${String(err)}` },
      { status: 400 }
    );
  }
}
