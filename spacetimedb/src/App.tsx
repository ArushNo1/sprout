import './App.css';
import { tables } from './module_bindings';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';

// Placeholder until the knowledge garden view is built: shows each learner's
// courses and how many concepts are tracked, straight from the database.
function App() {
  const { isActive: connected } = useSpacetimeDB();
  const [courses] = useTable(tables.course);
  const [concepts] = useTable(tables.concept);

  if (!connected) {
    return (
      <div className="App">
        <h1>Connecting...</h1>
      </div>
    );
  }

  return (
    <div className="App">
      <h1>Sprout</h1>
      {courses.length === 0 && <p>No courses yet</p>}
      {courses.map(course => (
        <p key={String(course.id)}>
          {course.name} ({course.status}):{' '}
          {concepts.filter(c => c.courseId === course.id).length} concepts
        </p>
      ))}
    </div>
  );
}

export default App;
