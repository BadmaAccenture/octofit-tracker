import { useEffect, useState } from 'react';
import { getJson } from '../api/client.js';

interface WorkoutSuggestion {
  _id?: string;
  title: string;
  focus: string;
  minutes: number;
  difficulty: string;
  reason: string;
}

export default function Workouts() {
  const [suggestions, setSuggestions] = useState<WorkoutSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userEmail = 'mona@example.com';

  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        setLoading(true);
        const encodedEmail = encodeURIComponent(userEmail);
        const response = await getJson<{ suggestions: WorkoutSuggestion[] }>(
          `/api/workouts/suggestions/${encodedEmail}`
        );
        setSuggestions(response.suggestions);
        setError(null);
      } catch (err) {
        setError('Unable to load suggestions');
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSuggestions();
  }, []);

  if (loading) {
    return (
      <section className="card h-100">
        <div className="card-body">
          <h2 className="h4">Workout suggestions</h2>
          <p role="status">Loading personalized suggestions...</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="card h-100">
        <div className="card-body">
          <h2 className="h4">Workout suggestions</h2>
          <div role="alert" className="alert alert-danger">
            {error}
          </div>
        </div>
      </section>
    );
  }

  if (suggestions.length === 0) {
    return (
      <section className="card h-100">
        <div className="card-body">
          <h2 className="h4">Workout suggestions</h2>
          <p>No suggestions available</p>
        </div>
      </section>
    );
  }

  const suggestion = suggestions[0];

  return (
    <section className="card h-100">
      <div className="card-body">
        <h2 className="h4">Workout suggestions</h2>
        <div className="card border-light">
          <div className="card-body">
            <h3 className="h5">{suggestion.title}</h3>
            <p>
              <strong>Focus:</strong> {suggestion.focus}
            </p>
            <p>
              <strong>Duration:</strong> {suggestion.minutes} minutes
            </p>
            <p>
              <strong>Difficulty:</strong> {suggestion.difficulty}
            </p>
            <p>
              <strong>Reason:</strong> {suggestion.reason}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
