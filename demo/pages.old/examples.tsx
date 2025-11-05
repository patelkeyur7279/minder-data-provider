/**
 * Examples Index
 * 
 * Browse all Minder examples with detailed explanations
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { DemoLayout } from '../components/DemoLayout';

interface Example {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  topics: string[];
  icon: string;
  component: string;
}

const examples: Example[] = [
  {
    id: '01-basic-usage',
    title: 'Basic Usage',
    description: 'Learn the fundamentals of useMinder hook with simple data fetching, loading states, and error handling.',
    difficulty: 'beginner',
    topics: ['useMinder', 'loading states', 'error handling', 'data fetching'],
    icon: '🎯',
    component: '01-basic-usage',
  },
  {
    id: '02-query-options',
    title: 'Query Options',
    description: 'Advanced query configuration including pagination, filtering, sorting, caching, and refetching strategies.',
    difficulty: 'intermediate',
    topics: ['pagination', 'filtering', 'caching', 'refetching', 'conditional fetching'],
    icon: '⚙️',
    component: '02-query-options',
  },
  {
    id: '03-crud-operations',
    title: 'CRUD Operations',
    description: 'Complete Create, Read, Update, Delete operations with form handling, validation, and optimistic updates.',
    difficulty: 'intermediate',
    topics: ['mutations', 'forms', 'validation', 'optimistic updates'],
    icon: '✏️',
    component: '03-crud-operations',
  },
  {
    id: '04-authentication',
    title: 'Authentication',
    description: 'User authentication flow with login, logout, protected routes, and token management.',
    difficulty: 'intermediate',
    topics: ['auth', 'login', 'tokens', 'protected routes', 'security'],
    icon: '🔐',
    component: '04-authentication',
  },
  {
    id: '05-caching',
    title: 'Caching & Performance',
    description: 'Optimize performance with caching strategies, cache invalidation, and background refetching.',
    difficulty: 'intermediate',
    topics: ['caching', 'performance', 'TTL', 'invalidation', 'prefetching'],
    icon: '⚡',
    component: '05-caching',
  },
];

export default function ExamplesIndex() {
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredExamples = examples.filter((example) => {
    const matchesDifficulty =
      selectedDifficulty === 'all' || example.difficulty === selectedDifficulty;
    
    const matchesSearch =
      searchTerm === '' ||
      example.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      example.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      example.topics.some((topic) =>
        topic.toLowerCase().includes(searchTerm.toLowerCase())
      );

    return matchesDifficulty && matchesSearch;
  });

  const getDifficultyColor = (difficulty: string): string => {
    switch (difficulty) {
      case 'beginner':
        return '#4caf50';
      case 'intermediate':
        return '#ff9800';
      case 'advanced':
        return '#f44336';
      default:
        return '#9e9e9e';
    }
  };

  return (
    <DemoLayout sidebarOpen={true}>
      <div className="examples-index">
        <div className="examples-header">
          <h1>📚 Minder Examples</h1>
          <p className="subtitle">
            Learn Minder through comprehensive, well-explained examples
          </p>
        </div>

        {/* Filters */}
        <div className="examples-filters">
          {/* Search */}
          <div className="search-box">
            <input
              type="text"
              placeholder="🔍 Search examples, topics..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          {/* Difficulty Filter */}
          <div className="difficulty-filter">
            <label>Difficulty:</label>
            <div className="filter-buttons">
              <button
                className={selectedDifficulty === 'all' ? 'active' : ''}
                onClick={() => setSelectedDifficulty('all')}
              >
                All
              </button>
              <button
                className={selectedDifficulty === 'beginner' ? 'active' : ''}
                onClick={() => setSelectedDifficulty('beginner')}
              >
                Beginner
              </button>
              <button
                className={selectedDifficulty === 'intermediate' ? 'active' : ''}
                onClick={() => setSelectedDifficulty('intermediate')}
              >
                Intermediate
              </button>
              <button
                className={selectedDifficulty === 'advanced' ? 'active' : ''}
                onClick={() => setSelectedDifficulty('advanced')}
              >
                Advanced
              </button>
            </div>
          </div>
        </div>

        {/* Examples Grid */}
        <div className="examples-grid">
          {filteredExamples.map((example) => (
            <Link
              key={example.id}
              href={`/examples/${example.id}`}
              className="example-card-link"
            >
              <div className="example-card">
                <div className="example-icon">{example.icon}</div>
                
                <div className="example-content">
                  <div className="example-title-row">
                    <h3>{example.title}</h3>
                    <span
                      className="difficulty-badge"
                      style={{ backgroundColor: getDifficultyColor(example.difficulty) }}
                    >
                      {example.difficulty}
                    </span>
                  </div>

                  <p className="example-description">{example.description}</p>

                  <div className="example-topics">
                    {example.topics.slice(0, 4).map((topic) => (
                      <span key={topic} className="topic-tag">
                        {topic}
                      </span>
                    ))}
                    {example.topics.length > 4 && (
                      <span className="topic-tag more">
                        +{example.topics.length - 4} more
                      </span>
                    )}
                  </div>
                </div>

                <div className="example-footer">
                  <span className="view-example">View Example →</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* No Results */}
        {filteredExamples.length === 0 && (
          <div className="no-results">
            <h3>No examples found</h3>
            <p>Try adjusting your filters or search term</p>
          </div>
        )}

        {/* Learning Path */}
        <div className="learning-path">
          <h2>🎓 Recommended Learning Path</h2>
          <div className="path-steps">
            <div className="path-step">
              <div className="step-number">1</div>
              <div className="step-content">
                <h4>Start with Basics</h4>
                <p>Begin with "Basic Usage" to understand useMinder fundamentals</p>
              </div>
            </div>
            
            <div className="path-arrow">↓</div>
            
            <div className="path-step">
              <div className="step-number">2</div>
              <div className="step-content">
                <h4>Explore Query Options</h4>
                <p>Learn pagination, filtering, and advanced query configuration</p>
              </div>
            </div>
            
            <div className="path-arrow">↓</div>
            
            <div className="path-step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h4>Master CRUD Operations</h4>
                <p>Build interactive forms with create, update, and delete</p>
              </div>
            </div>
            
            <div className="path-arrow">↓</div>
            
            <div className="path-step">
              <div className="step-number">4</div>
              <div className="step-content">
                <h4>Add Authentication</h4>
                <p>Secure your app with login, logout, and protected routes</p>
              </div>
            </div>
            
            <div className="path-arrow">↓</div>
            
            <div className="path-step">
              <div className="step-number">5</div>
              <div className="step-content">
                <h4>Optimize Performance</h4>
                <p>Use caching, prefetching, and other optimization techniques</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Reference */}
        <div className="quick-reference">
          <h2>📖 Quick Reference</h2>
          <div className="reference-grid">
            <div className="reference-card">
              <h4>Basic Query</h4>
              <pre>{`const { data, loading } = useMinder('/posts');`}</pre>
            </div>

            <div className="reference-card">
              <h4>With Parameters</h4>
              <pre>{`const { data } = useMinder('/posts', {
  params: { page: 1, limit: 10 }
});`}</pre>
            </div>

            <div className="reference-card">
              <h4>Mutation</h4>
              <pre>{`const create = useMinder('/posts', {
  method: 'POST',
  autoFetch: false
});

await create.mutate({ title, body });`}</pre>
            </div>

            <div className="reference-card">
              <h4>Refetch</h4>
              <pre>{`const { data, refetch } = useMinder('/posts');

// Later...
refetch();`}</pre>
            </div>

            <div className="reference-card">
              <h4>Conditional Fetch</h4>
              <pre>{`const { data } = useMinder('/user/profile', {
  enabled: isLoggedIn
});`}</pre>
            </div>

            <div className="reference-card">
              <h4>Cache Control</h4>
              <pre>{`const { data } = useMinder('/posts', {
  cacheTTL: 5 * 60 * 1000 // 5 minutes
});`}</pre>
            </div>
          </div>
        </div>

        <style jsx>{`
          .examples-index {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
          }

          .examples-header {
            text-align: center;
            margin-bottom: 3rem;
          }

          .examples-header h1 {
            font-size: 3rem;
            margin-bottom: 0.5rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }

          .subtitle {
            font-size: 1.25rem;
            color: #666;
          }

          .examples-filters {
            background: white;
            padding: 1.5rem;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            margin-bottom: 2rem;
          }

          .search-box {
            margin-bottom: 1.5rem;
          }

          .search-input {
            width: 100%;
            padding: 0.75rem 1rem;
            font-size: 1rem;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            transition: border-color 0.2s;
          }

          .search-input:focus {
            outline: none;
            border-color: #667eea;
          }

          .difficulty-filter label {
            display: block;
            font-weight: 600;
            margin-bottom: 0.5rem;
          }

          .filter-buttons {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
          }

          .filter-buttons button {
            padding: 0.5rem 1rem;
            border: 2px solid #e0e0e0;
            border-radius: 6px;
            background: white;
            cursor: pointer;
            transition: all 0.2s;
          }

          .filter-buttons button:hover {
            border-color: #667eea;
            color: #667eea;
          }

          .filter-buttons button.active {
            background: #667eea;
            color: white;
            border-color: #667eea;
          }

          .examples-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 1.5rem;
            margin-bottom: 3rem;
          }

          .example-card-link {
            text-decoration: none;
            color: inherit;
          }

          .example-card {
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            padding: 1.5rem;
            transition: all 0.3s;
            display: flex;
            flex-direction: column;
            height: 100%;
          }

          .example-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
          }

          .example-icon {
            font-size: 3rem;
            margin-bottom: 1rem;
          }

          .example-content {
            flex: 1;
          }

          .example-title-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.75rem;
          }

          .example-title-row h3 {
            margin: 0;
            font-size: 1.5rem;
          }

          .difficulty-badge {
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            color: white;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
          }

          .example-description {
            color: #666;
            line-height: 1.6;
            margin-bottom: 1rem;
          }

          .example-topics {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
          }

          .topic-tag {
            padding: 0.25rem 0.75rem;
            background: #f5f5f5;
            border-radius: 12px;
            font-size: 0.875rem;
            color: #666;
          }

          .topic-tag.more {
            background: #667eea;
            color: white;
          }

          .example-footer {
            margin-top: 1rem;
            padding-top: 1rem;
            border-top: 1px solid #f0f0f0;
          }

          .view-example {
            color: #667eea;
            font-weight: 600;
          }

          .no-results {
            text-align: center;
            padding: 3rem;
            color: #999;
          }

          .learning-path {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
            border-radius: 12px;
            margin-bottom: 3rem;
          }

          .learning-path h2 {
            text-align: center;
            margin-bottom: 2rem;
          }

          .path-steps {
            max-width: 600px;
            margin: 0 auto;
          }

          .path-step {
            display: flex;
            gap: 1rem;
            background: rgba(255, 255, 255, 0.1);
            padding: 1rem;
            border-radius: 8px;
          }

          .step-number {
            width: 40px;
            height: 40px;
            background: white;
            color: #667eea;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            flex-shrink: 0;
          }

          .step-content h4 {
            margin: 0 0 0.5rem 0;
          }

          .step-content p {
            margin: 0;
            opacity: 0.9;
          }

          .path-arrow {
            text-align: center;
            padding: 0.5rem;
            font-size: 2rem;
          }

          .quick-reference {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }

          .quick-reference h2 {
            text-align: center;
            margin-bottom: 2rem;
          }

          .reference-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1rem;
          }

          .reference-card {
            background: #f9f9f9;
            padding: 1rem;
            border-radius: 8px;
            border-left: 4px solid #667eea;
          }

          .reference-card h4 {
            margin: 0 0 0.5rem 0;
            color: #667eea;
          }

          .reference-card pre {
            margin: 0;
            padding: 0.75rem;
            background: #2d3748;
            color: #fff;
            border-radius: 4px;
            overflow-x: auto;
            font-size: 0.875rem;
          }

          @media (max-width: 768px) {
            .examples-grid {
              grid-template-columns: 1fr;
            }

            .reference-grid {
              grid-template-columns: 1fr;
            }

            .examples-header h1 {
              font-size: 2rem;
            }
          }
        `}</style>
      </div>
    </DemoLayout>
  );
}
