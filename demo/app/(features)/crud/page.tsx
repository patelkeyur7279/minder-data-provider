'use client';

import { MainLayout } from '@/components/layout/MainLayout';
import { PostsList } from '@/features/crud/components/PostsList';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';

export default function CRUDPage() {
  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              CRUD Operations
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              Complete data management with create, read, update, and delete operations. 
              Features pagination, search, real-time updates, and optimistic UI.
            </p>
          </div>

          {/* Feature Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Create & Edit</CardTitle>
                <CardDescription>
                  Rich forms with validation and real-time preview
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Search & Filter</CardTitle>
                <CardDescription>
                  Advanced search with debouncing and instant results
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Optimistic Updates</CardTitle>
                <CardDescription>
                  Instant UI updates with automatic cache invalidation
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          {/* Posts List */}
          <Card>
            <CardContent className="p-6">
              <PostsList />
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
