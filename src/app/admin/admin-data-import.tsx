'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Upload, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

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

export function AdminDataImport() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/admin/bulk-import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Import failed');
        return;
      }

      setResult(data);
      setFile(null);
    } catch (err) {
      setError(`Error: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  const downloadTemplate = () => {
    const csv = `full_name,email,phone,role,exam_target,buddy_email
Aarav Sharma,aarav@careerrai.com,+91-9876543210,student,CAT,
Priya Kapoor,priya@careerrai.com,+91-9876543211,student,CUET,
Rohan Patel,rohan@careerrai.com,+91-9876543212,student,CAT,
Nishant Yadav,nishant@careerrai.com,+91-9876543215,buddy,,`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'careerrai-import-template.csv';
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Upload Form */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Import Students & Buddies
        </h3>

        <form onSubmit={handleUpload} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-2">
              CSV File (full_name, email, phone, role, exam_target, buddy_email)
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={loading}
              className="block w-full text-sm text-stone-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200"
            />
            <p className="text-xs text-stone-500 mt-1">
              Supports: full_name, email, phone, role (student/buddy), exam_target (CAT/CUET), buddy_email
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!file || loading}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition',
                !file || loading
                  ? 'bg-stone-200 text-stone-500 cursor-not-allowed'
                  : 'bg-orange-600 text-white hover:bg-orange-700'
              )}
            >
              {loading ? 'Uploading...' : 'Upload & Import'}
            </button>
            <button
              type="button"
              onClick={downloadTemplate}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-stone-100 text-stone-900 hover:bg-stone-200 transition flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Template
            </button>
          </div>
        </form>
      </Card>

      {/* Error message */}
      {error && (
        <Card className="p-4 bg-rose-50 border-rose-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-rose-900">Import Error</div>
              <p className="text-sm text-rose-800 mt-1">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Success result */}
      {result && (
        <Card className="p-5">
          <div className="space-y-4">
            {/* Summary stats */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="font-semibold text-stone-900">Import Summary</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-stone-50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-stone-900">{result.summary.total}</div>
                  <div className="text-xs text-stone-500">Total Rows</div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-emerald-700">{result.summary.created}</div>
                  <div className="text-xs text-emerald-600">Created</div>
                </div>
                <div className={cn('rounded-lg p-3 text-center', result.summary.failed > 0 ? 'bg-rose-50' : 'bg-stone-50')}>
                  <div className={cn('text-lg font-bold', result.summary.failed > 0 ? 'text-rose-700' : 'text-stone-900')}>
                    {result.summary.failed}
                  </div>
                  <div className={cn('text-xs', result.summary.failed > 0 ? 'text-rose-600' : 'text-stone-500')}>
                    Failed
                  </div>
                </div>
              </div>
            </div>

            {/* Created users list */}
            {result.created.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-stone-900 mb-2">✓ Successfully Created ({result.created.length})</h4>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {result.created.map((item) => (
                    <div key={item.email} className="text-xs text-stone-700 flex items-center gap-2 p-2 bg-stone-50 rounded">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                      <span className="font-mono">{item.email}</span>
                      <div className="ml-auto"><Badge color="stone">{item.role}</Badge></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {result.errors.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-rose-900 mb-2">✗ Validation Errors ({result.errors.length})</h4>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {result.errors.map((item, i) => (
                    <div key={i} className="text-xs text-rose-800 p-2 bg-rose-50 rounded border border-rose-200">
                      <div className="font-mono font-semibold">{item.email}</div>
                      <div className="text-rose-700">{item.error}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Buddy assignment errors */}
            {result.buddyErrors.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-amber-900 mb-2">⚠ Buddy Assignment Errors ({result.buddyErrors.length})</h4>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {result.buddyErrors.map((item, i) => (
                    <div key={i} className="text-xs text-amber-800 p-2 bg-amber-50 rounded border border-amber-200">
                      <div className="font-mono font-semibold">{item.email}</div>
                      <div className="text-amber-700">{item.error}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Instructions */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <h4 className="text-xs font-semibold text-blue-900 mb-2 uppercase tracking-wide">Import Guide</h4>
        <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
          <li><strong>Role:</strong> Must be "student" or "buddy"</li>
          <li><strong>Email:</strong> Must be unique (not already in system)</li>
          <li><strong>Exam Target:</strong> Required for students (CAT/CUET), leave blank for buddies</li>
          <li><strong>Buddy Email:</strong> Optional. If provided, must match a buddy email in the same import</li>
          <li><strong>Password:</strong> Auto-generated temporarily. Users should reset on first login</li>
        </ul>
      </Card>
    </div>
  );
}
