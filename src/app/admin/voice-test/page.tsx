'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle2, XCircle, AlertCircle, Mic, Upload } from 'lucide-react';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'pending';
  message: string;
  details?: string;
}

export default function VoiceTestPage() {
  const supabase = createClient();
  const [results, setResults] = useState<TestResult[]>([]);
  const [testing, setTesting] = useState(true);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    runTests();
  }, []);

  const runTests = async () => {
    const testResults: TestResult[] = [];

    // Test 1: Authentication
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        testResults.push({
          name: '✓ Authentication',
          status: 'pass',
          message: `Logged in as ${user.email}`,
        });
      } else {
        testResults.push({
          name: '✗ Authentication',
          status: 'fail',
          message: 'Not authenticated',
        });
      }
    } catch (err) {
      testResults.push({
        name: '✗ Authentication',
        status: 'fail',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    // Test 2: Check buddy_feedback table columns
    try {
      const { data, error } = await supabase
        .from('buddy_feedback')
        .select('*')
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        const firstRow = data[0] as any;
        const hasVoiceUrl = 'voice_note_url' in firstRow;
        const hasFeedbackType = 'feedback_type' in firstRow;

        if (hasVoiceUrl && hasFeedbackType) {
          testResults.push({
            name: '✓ Database Schema',
            status: 'pass',
            message: 'buddy_feedback table has voice_note_url and feedback_type columns',
          });
        } else {
          testResults.push({
            name: '⚠ Database Schema',
            status: 'warning',
            message: 'Columns might not exist yet',
            details: `Has voice_note_url: ${hasVoiceUrl}, Has feedback_type: ${hasFeedbackType}`,
          });
        }
      } else {
        testResults.push({
          name: '⚠ Database Schema',
          status: 'warning',
          message: 'No records in buddy_feedback table to verify schema',
          details: 'Run a test feedback to verify columns are present',
        });
      }
    } catch (err) {
      testResults.push({
        name: '✗ Database Schema',
        status: 'fail',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    // Test 3: Check storage bucket
    try {
      // Try to access the bucket directly (works with anon key if bucket is public)
      const { data: buckets, error: checkError } = await supabase.storage
        .from('voice-notes')
        .list('', { limit: 1 });

      if (checkError && checkError.statusCode === 404) {
        testResults.push({
          name: '✗ Storage Bucket',
          status: 'fail',
          message: 'voice-notes bucket not found',
          details: 'Create a public bucket named "voice-notes" in Supabase Storage',
        });
      } else if (checkError) {
        // Could be a permission error or other issue
        testResults.push({
          name: '⚠ Storage Bucket',
          status: 'warning',
          message: 'Unable to verify bucket (may still exist and be accessible)',
          details: checkError.message,
        });
      } else {
        testResults.push({
          name: '✓ Storage Bucket',
          status: 'pass',
          message: 'voice-notes bucket exists and is accessible',
        });
      }
    } catch (err) {
      testResults.push({
        name: '✗ Storage Bucket Check',
        status: 'fail',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    // Test 4: Microphone access
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());

      testResults.push({
        name: '✓ Microphone Access',
        status: 'pass',
        message: 'Microphone is accessible',
      });
    } catch (err) {
      testResults.push({
        name: '✗ Microphone Access',
        status: 'fail',
        message: err instanceof Error ? err.message : 'Unknown error',
        details: 'Grant microphone permission in browser settings',
      });
    }

    setResults(testResults);
    setTesting(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);

      let seconds = 0;
      const interval = setInterval(() => {
        seconds++;
        setRecordingTime(seconds);
        if (seconds >= 10) {
          clearInterval(interval);
          mediaRecorder.stop();
          setIsRecording(false);
        }
      }, 1000);
    } catch (err) {
      alert('Failed to access microphone: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  };

  const testUpload = async () => {
    if (!audioBlob) {
      alert('Please record audio first');
      return;
    }

    try {
      const fileName = `test-${Date.now()}.webm`;

      const { data, error } = await supabase.storage
        .from('voice-notes')
        .upload(fileName, audioBlob, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      const { data: publicUrl } = supabase.storage
        .from('voice-notes')
        .getPublicUrl(data.path);

      alert(`✓ Upload successful!\n\nFile: ${fileName}\nURL: ${publicUrl.publicUrl}`);

      setResults((prev) =>
        prev.map((r) =>
          r.name.includes('Storage Upload')
            ? { ...r, status: 'pass', message: 'Test upload successful' }
            : r
        )
      );
    } catch (err) {
      alert(`✗ Upload failed:\n\n${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const getIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'fail':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      default:
        return <div className="w-5 h-5 bg-gray-300 rounded-full animate-spin" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-xl p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Voice Recording Diagnostics</h1>
          <p className="text-gray-600 mb-6">Test your voice recording setup</p>

          {/* Test Results */}
          <div className="space-y-3 mb-8">
            {testing ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 bg-blue-300 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-gray-600">Running tests...</p>
              </div>
            ) : (
              results.map((result, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-4 rounded-lg border-2 ${
                    result.status === 'pass'
                      ? 'bg-green-50 border-green-200'
                      : result.status === 'fail'
                        ? 'bg-red-50 border-red-200'
                        : 'bg-yellow-50 border-yellow-200'
                  }`}
                >
                  {getIcon(result.status)}
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{result.name}</p>
                    <p className="text-sm text-gray-700">{result.message}</p>
                    {result.details && <p className="text-xs text-gray-600 mt-1">{result.details}</p>}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Test Recording */}
          <div className="border-t-2 border-gray-200 pt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Manual Test: Record & Upload</h2>

            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-gray-900">Recording Status</p>
                  <p className="text-sm text-gray-600">{recordingTime}s</p>
                </div>

                {!isRecording && !audioBlob && (
                  <button
                    onClick={startRecording}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
                  >
                    <Mic className="w-5 h-5" />
                    Start Recording (10 seconds)
                  </button>
                )}

                {isRecording && (
                  <p className="text-center text-blue-600 font-semibold">🎤 Recording... please speak</p>
                )}

                {audioBlob && (
                  <>
                    <p className="text-center text-green-600 font-semibold mb-3">✓ Audio recorded ({audioBlob.size} bytes)</p>
                    <button
                      onClick={testUpload}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition"
                    >
                      <Upload className="w-5 h-5" />
                      Test Upload to Supabase
                    </button>
                    <button
                      onClick={() => {
                        setAudioBlob(null);
                        setRecordingTime(0);
                      }}
                      className="w-full mt-2 px-4 py-2 bg-gray-300 text-gray-900 rounded-lg font-semibold hover:bg-gray-400 transition"
                    >
                      Record Again
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="border-t-2 border-gray-200 mt-6 pt-6">
            <h3 className="font-bold text-gray-900 mb-3">Setup Instructions</h3>
            <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
              <li>Run database migrations from SUPABASE_SETUP.md</li>
              <li>Create 'voice-notes' storage bucket in Supabase</li>
              <li>Set bucket to PUBLIC visibility</li>
              <li>Add storage bucket policies</li>
              <li>Run this diagnostic test</li>
              <li>Test recording and upload above</li>
            </ol>
          </div>

          {/* Summary */}
          <div className="mt-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
            <p className="text-sm text-gray-700">
              <strong>All tests passing?</strong> Voice recording should work! Try recording a message in the app.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
