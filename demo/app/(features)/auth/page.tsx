'use client';

import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { AuthProvider, useAuth } from '@/features/auth/components/AuthProvider';
import { LoginForm } from '@/features/auth/components/LoginForm';
import { RegisterForm } from '@/features/auth/components/RegisterForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LogOut, User, Mail, Shield } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

function AuthContent() {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const { user, isAuthenticated, logout } = useAuth();

  if (isAuthenticated && user) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Welcome back!</CardTitle>
                <CardDescription>You are successfully logged in</CardDescription>
              </div>
              <Button variant="outline" onClick={logout}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.username}
                  className="w-20 h-20 rounded-full"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-2xl font-semibold">
                  {user.username.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h3 className="text-xl font-semibold">{user.username}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {user.first_name} {user.last_name}
                </p>
                <Badge variant="secondary" className="mt-2">
                  {user.role}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <Mail className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Email</p>
                  <p className="text-sm font-medium">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <Shield className="w-5 h-5 text-green-600" />
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Role</p>
                  <p className="text-sm font-medium capitalize">{user.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <User className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Member Since</p>
                  <p className="text-sm font-medium">{formatDateTime(user.created_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <User className="w-5 h-5 text-orange-600" />
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">User ID</p>
                  <p className="text-sm font-medium">#{user.id}</p>
                </div>
              </div>
            </div>

            {user.bio && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Bio</p>
                <p className="text-sm">{user.bio}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Tabs */}
      <div className="flex justify-center gap-2">
        <Button
          variant={activeTab === 'login' ? 'default' : 'outline'}
          onClick={() => setActiveTab('login')}
        >
          Login
        </Button>
        <Button
          variant={activeTab === 'register' ? 'default' : 'outline'}
          onClick={() => setActiveTab('register')}
        >
          Register
        </Button>
      </div>

      {/* Forms */}
      <div className="flex justify-center">
        {activeTab === 'login' ? <LoginForm /> : <RegisterForm />}
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <AuthProvider>
      <MainLayout>
        <div className="container mx-auto px-4 py-8">
          {/* Page Header */}
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Authentication
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              JWT-based authentication with token refresh, session management, and secure logout.
              Features automatic token persistence and role-based access control.
            </p>
          </div>

          <AuthContent />
        </div>
      </MainLayout>
    </AuthProvider>
  );
}
