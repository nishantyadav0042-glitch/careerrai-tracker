'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle2, Circle, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TodoItem } from '@/types';

interface TodoListSectionProps {
  studentId: string;
}

const CATEGORY_COLORS = {
  buddy_suggested: 'bg-teal-50 border-teal-200 text-teal-700',
  student_custom: 'bg-orange-50 border-orange-200 text-orange-700',
  daily_puzzle: 'bg-blue-50 border-blue-200 text-blue-700',
  mock_review: 'bg-purple-50 border-purple-200 text-purple-700',
  session: 'bg-pink-50 border-pink-200 text-pink-700',
};

const CATEGORY_ICONS = {
  buddy_suggested: '💬',
  student_custom: '✏️',
  daily_puzzle: '🧩',
  mock_review: '📊',
  session: '🎥',
};

export function TodoListSection({ studentId }: TodoListSectionProps) {
  const supabase = createClient();
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');

  useEffect(() => {
    const fetchTodos = async () => {
      try {
        const { data } = await supabase
          .from('todo_items')
          .select('*')
          .eq('student_id', studentId)
          .order('priority', { ascending: false })
          .order('due_date', { ascending: true });

        setTodos((data ?? []) as TodoItem[]);
      } catch (error) {
        console.error('Failed to fetch todos:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTodos();
  }, [studentId, supabase]);

  const toggleTodo = async (todoId: string, currentState: boolean) => {
    try {
      const { error } = await supabase
        .from('todo_items')
        .update({
          completed_at: currentState ? null : new Date().toISOString(),
        })
        .eq('id', todoId);

      if (error) throw error;

      setTodos((prev) =>
        prev.map((t) =>
          t.id === todoId
            ? { ...t, completed_at: currentState ? undefined : new Date().toISOString() }
            : t
        )
      );
    } catch (error) {
      console.error('Failed to toggle todo:', error);
    }
  };

  const deleteTodo = async (todoId: string) => {
    try {
      const { error } = await supabase
        .from('todo_items')
        .delete()
        .eq('id', todoId);

      if (error) throw error;

      setTodos((prev) => prev.filter((t) => t.id !== todoId));
    } catch (error) {
      console.error('Failed to delete todo:', error);
    }
  };

  const addTodo = async () => {
    if (!newTodoText.trim()) return;

    try {
      const { data, error } = await supabase
        .from('todo_items')
        .insert({
          student_id: studentId,
          title: newTodoText.trim(),
          category: 'student_custom',
          priority: 0,
          created_by: studentId,
        })
        .select()
        .single();

      if (error) throw error;

      setTodos((prev) => [data as TodoItem, ...prev]);
      setNewTodoText('');
    } catch (error) {
      console.error('Failed to add todo:', error);
    }
  };

  const activeTodos = todos.filter((t) => !t.completed_at);
  const completedTodos = todos.filter((t) => t.completed_at);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-stone-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (todos.length === 0) {
    return (
      <div className="text-center py-6 text-stone-500 text-sm">
        <p>No to-dos yet. Add one or wait for buddy suggestions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Add New Todo */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newTodoText}
          onChange={(e) => setNewTodoText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              addTodo();
            }
          }}
          placeholder="Add a task..."
          className="flex-1 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
        />
        <button
          onClick={addTodo}
          disabled={!newTodoText.trim()}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Active Todos */}
      {activeTodos.length > 0 && (
        <div className="space-y-2">
          {(isExpanded ? activeTodos : activeTodos.slice(0, 3)).map((todo) => (
            <div
              key={todo.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border transition-all',
                CATEGORY_COLORS[todo.category as keyof typeof CATEGORY_COLORS] || CATEGORY_COLORS.student_custom
              )}
            >
              <button
                onClick={() => toggleTodo(todo.id, false)}
                className="flex-shrink-0 hover:scale-110 transition-transform"
              >
                <Circle className="w-5 h-5" />
              </button>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">
                  {CATEGORY_ICONS[todo.category as keyof typeof CATEGORY_ICONS]} {todo.title}
                </p>
                {todo.due_date && (
                  <p className="text-xs text-stone-600 mt-0.5">
                    Due: {new Date(todo.due_date + 'T00:00:00').toLocaleDateString('en-IN')}
                  </p>
                )}
              </div>

              <button
                onClick={() => deleteTodo(todo.id)}
                className="flex-shrink-0 text-stone-400 hover:text-red-600 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {!isExpanded && activeTodos.length > 3 && (
            <button
              onClick={() => setIsExpanded(true)}
              className="w-full text-xs text-orange-700 font-medium hover:underline py-2"
            >
              Show {activeTodos.length - 3} more →
            </button>
          )}
        </div>
      )}

      {/* Completed Todos (collapsed) */}
      {completedTodos.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-stone-200">
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold px-1">
            ✓ Completed ({completedTodos.length})
          </p>
          {(isExpanded ? completedTodos : completedTodos.slice(0, 1)).map((todo) => (
            <div
              key={todo.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-stone-100 opacity-60"
            >
              <button
                onClick={() => toggleTodo(todo.id, true)}
                className="flex-shrink-0"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </button>

              <div className="flex-1 min-w-0">
                <p className="text-sm line-through text-stone-600 truncate">
                  {todo.title}
                </p>
              </div>

              <button
                onClick={() => deleteTodo(todo.id)}
                className="flex-shrink-0 text-stone-400 hover:text-red-600 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Progress Bar */}
      {todos.length > 0 && (
        <div className="mt-4 pt-3 border-t border-stone-200">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-stone-700">Daily Progress</span>
            <span className="text-xs font-bold text-stone-900">
              {completedTodos.length}/{todos.length}
            </span>
          </div>
          <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-600 to-teal-600 transition-all duration-300"
              style={{
                width: `${(completedTodos.length / todos.length) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
