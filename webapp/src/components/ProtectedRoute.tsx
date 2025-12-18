import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/AuthStore'

interface ProtectedRouteProps {
  isAuthenticated: boolean
  children: ReactNode
}

export function ProtectedRoute({ isAuthenticated, children }: ProtectedRouteProps) {
  const location = useLocation()
  const { authLoading } = useAuthStore()

  // Show nothing while checking auth to prevent flash of login page
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    // Save the attempted location for redirect after login
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
