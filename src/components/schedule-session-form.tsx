'use client';

import { useState } from 'react';
import { Calendar, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ScheduleSessionFormProps {
  studentId: string;
  studentName: string;
  buddyName: string;
  onSuccess?: (meetLink: string | null) => void;
  onError?: (error: string) => void;
}

export function ScheduleSessionForm({
  studentId,
  studentName,
  buddyName,
  onSuccess,
  onError,
}: ScheduleSessionFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [meetLink, setMeetLink] = useState<string | null>(null);
  const [calendarWarning, setCalendarWarning] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    setCalendarWarning(null);

    try {
      if (!title.trim()) {
        throw new Error('Session title is required');
      }
      if (!startDate || !startTime || !endTime) {
        throw new Error('Please fill in all date and time fields');
      }

      // Create ISO datetime strings
      const startDateTime = `${startDate}T${startTime}:00Z`;
      const endDateTime = `${startDate}T${endTime}:00Z`;

      // Validate times
      const startMs = new Date(startDateTime).getTime();
      const endMs = new Date(endDateTime).getTime();

      if (startMs >= endMs) {
        throw new Error('End time must be after start time');
      }

      // Call schedule API
      const response = await fetch('/api/sessions/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          title: title.trim(),
          description: description.trim() || undefined,
          startTime: startDateTime,
          endTime: endDateTime,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to schedule session');
      }

      const data = await response.json();

      setSuccess(true);
      if (data.session.googleMeetLink) {
        setMeetLink(data.session.googleMeetLink);
      }

      if (data.calendarStatus.error) {
        setCalendarWarning(data.calendarStatus.error);
      }

      // Reset form
      setTitle('');
      setDescription('');
      setStartDate('');
      setStartTime('');
      setEndTime('');

      onSuccess?.(data.session.googleMeetLink);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to schedule session';
      setError(message);
      onError?.(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Student Info (Read-only) */}
      <div className="p-4 bg-stone-50 rounded-lg border border-stone-200">
        <p className="text-xs text-stone-600 uppercase tracking-wider font-semibold mb-1">
          Student
        </p>
        <p className="text-lg font-semibold text-stone-900">{studentName}</p>
      </div>

      {/* Session Title */}
      <div>
        <label className="block text-sm font-medium text-stone-900 mb-2">
          Session Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., CAT Mock Test Review"
          className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-stone-900 mb-2">
          Description (Optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add any notes or details about this session"
          rows={3}
          className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
      </div>

      {/* Date & Time */}
      <div className="space-y-4">
        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-stone-900 mb-2 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
        </div>

        {/* Times */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-stone-900 mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Start Time
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-900 mb-2">End Time</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
          <div className="flex gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-green-700">
              <p className="font-medium">Session scheduled successfully!</p>
            </div>
          </div>

          {meetLink && (
            <div className="mt-2 p-2 bg-white rounded border border-green-100">
              <p className="text-xs text-stone-600 mb-1">Google Meet Link:</p>
              <a
                href={meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline break-all"
              >
                {meetLink}
              </a>
            </div>
          )}

          {calendarWarning && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-xs text-yellow-800">
                ⚠️ {calendarWarning}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
      >
        {loading ? 'Scheduling...' : 'Schedule Session'}
      </button>

      <p className="text-xs text-stone-600">
        💡 Sessions will be added to your Google Calendar with automatic Meet links if connected.
      </p>
    </form>
  );
}
